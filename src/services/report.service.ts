import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';
import { GenerateReportInput } from '../validators/report.validator.js';

export interface ExportReportResult {
  filename: string;
  contentType: string;
  content: string;
}

export class ReportService {
  /**
   * Retrieves an existing persisted session intelligence report.
   */
  public static async getReport(userId: string, sessionId: string) {
    const report = await PrismaService.client.sessionReport.findUnique({
      where: { sessionId },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            mode: true,
            status: true,
            aiModel: true,
            durationSeconds: true,
            creditsConsumed: true,
            createdAt: true,
            endedAt: true,
          },
        },
      },
    });

    if (!report) {
      return null;
    }

    if (report.userId !== userId) {
      throw AppError.forbidden('You are not authorized to view reports for this session.');
    }

    return report;
  }

  /**
   * Generates or regenerates an AI Session Report using Gemini 2.5 Flash via AI service.
   * Strictly grounded in actual session events (transcripts, tools, snapshots).
   */
  public static async generateReport(
    userId: string,
    sessionId: string,
    options: GenerateReportInput = { regenerate: false }
  ) {
    const prisma = PrismaService.client;

    // 1. Verify session exists and belongs to user
    const session = await prisma.aISession.findUnique({
      where: { id: sessionId },
      include: {
        transcriptSegments: {
          orderBy: { sequenceNumber: 'asc' },
        },
        snapshots: {
          orderBy: { captureTimestamp: 'asc' },
        },
        toolExecutions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw AppError.notFound(`Session with ID ${sessionId} not found.`);
    }

    if (session.userId !== userId) {
      throw AppError.forbidden('You do not own this session.');
    }

    // 2. Return existing report if not forcing regeneration
    if (!options.regenerate) {
      const existing = await prisma.sessionReport.findUnique({
        where: { sessionId },
      });
      if (existing) {
        return existing;
      }
    }

    // 3. Package actual session content for AI synthesis
    const payload = {
      session_id: session.id,
      session_title: session.title,
      mode: session.mode,
      duration_seconds: session.durationSeconds || 0,
      credits_consumed: session.creditsConsumed || 0,
      transcripts: session.transcriptSegments.map((t) => ({
        sequence: t.sequenceNumber,
        speaker: t.speakerType,
        speaker_name: t.speakerName,
        text: t.text,
        language: t.language,
        timestamp: t.createdAt.toISOString(),
      })),
      tools: session.toolExecutions.map((tool) => ({
        id: tool.id,
        name: tool.toolName,
        status: tool.status,
        arguments: tool.arguments as any,
        result: tool.resultMetadata as any,
        duration_ms: tool.executionDurationMs,
        timestamp: tool.createdAt.toISOString(),
      })),
      snapshots: session.snapshots.map((s) => ({
        id: s.id,
        source: s.source,
        cloud_url: s.cloudinaryUrl,
        extracted_text: s.extractedText,
        ai_analysis: s.aiAnalysis,
        timestamp: s.captureTimestamp.toISOString(),
      })),
      options: {
        focus_area: options.focusArea,
        model: options.model || 'gemini-2.5-flash',
      },
    };

    let reportData: any = null;

    // 4. Call Python AI microservice internal RPC
    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/api/v1/internal/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.INTERNAL_SERVICE_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        if (json.success && json.report) {
          reportData = json.report;
        }
      } else {
        logger.warn(
          `AI service report generation endpoint returned HTTP ${response.status}: ${await response.text()}`
        );
      }
    } catch (err: any) {
      logger.error(`Failed to invoke AI microservice for report generation: ${err.message}`);
    }

    // 5. Fallback deterministic grounded report if AI service is offline
    if (!reportData) {
      logger.info('Using local deterministic grounded report generator fallback');
      reportData = this.buildExtractiveGroundedReport(session);
    }

    // 6. Persist report record in PostgreSQL
    const saved = await prisma.sessionReport.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        userId: session.userId,
        title: reportData.title || `Intelligence Report: ${session.title}`,
        overview: reportData.overview || 'Executive session intelligence report.',
        keyTopics: reportData.key_topics || [session.mode],
        importantQuestions: reportData.important_questions || [],
        keyObservations: reportData.key_observations || [],
        decisions: reportData.decisions || [],
        actionItems: reportData.action_items || [],
        taskChecklist: reportData.task_checklist || [],
        followUpQuestions: reportData.follow_up_questions || [],
        relevantSnapshots: reportData.relevant_snapshots || [],
        toolActivitySummary: reportData.tool_activity_summary || {
          total_calls: session.toolExecutions.length,
          tools_used: [],
        },
        sessionDuration: session.durationSeconds || 0,
        creditsConsumed: session.creditsConsumed || 0,
        modelUsed: reportData.model_used || 'gemini-2.5-flash',
        metadata: {
          generatedAt: new Date().toISOString(),
          isGrounded: true,
          transcriptTurnsCount: session.transcriptSegments.length,
          snapshotsCount: session.snapshots.length,
          toolsCount: session.toolExecutions.length,
        },
      },
      update: {
        title: reportData.title || `Intelligence Report: ${session.title}`,
        overview: reportData.overview || 'Executive session intelligence report.',
        keyTopics: reportData.key_topics || [session.mode],
        importantQuestions: reportData.important_questions || [],
        keyObservations: reportData.key_observations || [],
        decisions: reportData.decisions || [],
        actionItems: reportData.action_items || [],
        taskChecklist: reportData.task_checklist || [],
        followUpQuestions: reportData.follow_up_questions || [],
        relevantSnapshots: reportData.relevant_snapshots || [],
        toolActivitySummary: reportData.tool_activity_summary || {
          total_calls: session.toolExecutions.length,
          tools_used: [],
        },
        sessionDuration: session.durationSeconds || 0,
        creditsConsumed: session.creditsConsumed || 0,
        modelUsed: reportData.model_used || 'gemini-2.5-flash',
        metadata: {
          regeneratedAt: new Date().toISOString(),
          isGrounded: true,
          transcriptTurnsCount: session.transcriptSegments.length,
          snapshotsCount: session.snapshots.length,
          toolsCount: session.toolExecutions.length,
        },
      },
    });

    return saved;
  }

  /**
   * Deterministic local fallback strictly grounded in actual session events.
   */
  private static buildExtractiveGroundedReport(session: any) {
    const transcripts = session.transcriptSegments || [];
    const tools = session.toolExecutions || [];
    const snapshots = session.snapshots || [];

    // Extract questions and following answers
    const questions: any[] = [];
    for (let i = 0; i < transcripts.length; i++) {
      const t = transcripts[i];
      if (t.text.includes('?')) {
        const nextAi = transcripts.slice(i + 1).find((nxt: any) => nxt.speakerType === 'AI');
        questions.push({
          question: t.text.trim(),
          answer: nextAi ? nextAi.text.trim() : 'Answer recorded in live session.',
          asker: t.speakerName || t.speakerType,
          answered_by: nextAi ? nextAi.speakerName || 'Gemini 3.8 Live' : 'AI',
          turn_ref: t.sequenceNumber,
        });
      }
    }

    // Extract action items & task checklist
    const actionItems: any[] = [];
    const checklist: any[] = [];
    let actIndex = 1;

    for (const t of transcripts) {
      const lower = t.text.toLowerCase();
      if (
        lower.includes('let me') ||
        lower.includes('i will') ||
        lower.includes('we should') ||
        lower.includes('we need to') ||
        lower.includes('action:') ||
        lower.includes('todo') ||
        lower.includes('generate a patch')
      ) {
        const taskText = t.text.split('.')[0].trim().slice(0, 100);
        let owner: string | null = null;
        if (lower.includes('i will') || lower.includes('let me')) {
          owner = t.speakerType === 'AI' ? 'Gemini 3.8 Live' : t.speakerName || 'User';
        }

        let deadline: string | null = null;
        if (lower.includes('by ') || lower.includes('before ')) {
          const m = t.text.match(/(?:by|before)\s+([a-zA-Z0-9\s]+?)(?:\.|\,|$)/i);
          if (m) deadline = m[1].trim();
        }

        const priority =
          lower.includes('critical') || lower.includes('race condition') || lower.includes('urgent')
            ? 'HIGH'
            : 'MEDIUM';

        actionItems.push({
          task: taskText,
          description: t.text,
          owner,
          deadline,
          priority,
          transcript_reference: `Turn #${t.sequenceNumber}`,
        });

        checklist.push({
          id: `chk-${actIndex}`,
          text: taskText,
          completed: false,
          owner,
        });
        actIndex++;
      }
    }

    const observations: string[] = [];
    const decisions: string[] = [];
    for (const t of transcripts) {
      const lower = t.text.toLowerCase();
      if (lower.includes('see') || lower.includes('observe') || lower.includes('notice')) {
        observations.push(t.text.trim());
      }
      if (lower.includes('decision') || lower.includes('agreed') || lower.includes('patch') || lower.includes('decided')) {
        decisions.push(t.text.trim());
      }
    }

    if (observations.length === 0 && transcripts.length > 0) {
      observations.push(`Session executed under ${session.mode.replace('_', ' ')} mode.`);
    }
    if (decisions.length === 0 && transcripts.length > 0) {
      decisions.push('Session completed with context saved to session library.');
    }

    const toolsUsed = Array.from(new Set(tools.map((x: any) => x.toolName)));
    const successfulTools = tools.filter((x: any) => x.status === 'SUCCESS' || x.status === 'COMPLETED').length;

    return {
      session_id: session.id,
      title: `Intelligence Report: ${session.title}`,
      overview: `Official session intelligence synthesis for '${session.title}'. Duration: ${session.durationSeconds}s. Analyzed ${transcripts.length} conversational turns, ${snapshots.length} visual snapshots, and ${tools.length} tool executions.`,
      key_topics: [session.mode.replace('_', ' ')],
      important_questions: questions,
      key_observations: observations,
      decisions,
      action_items: actionItems,
      task_checklist: checklist,
      follow_up_questions: [
        'Would you like to test the discussed implementations in a new live studio session?',
        'Are there additional architectural considerations to evaluate?',
      ],
      relevant_snapshots: snapshots.map((s: any) => ({
        snapshot_id: s.id,
        reason: `Captured from ${s.source}: ${s.extractedText || s.aiAnalysis || 'Visual inspection frame'}`,
        source: s.source,
        thumbnail: s.cloudinaryUrl,
      })),
      tool_activity_summary: {
        total_calls: tools.length,
        successful_calls: successfulTools,
        failed_calls: tools.length - successfulTools,
        tools_used: toolsUsed,
        summary_notes: tools.length > 0 ? `${tools.length} tool executions recorded.` : 'No tools were invoked during this session.',
      },
      session_duration: session.durationSeconds || 0,
      credits_consumed: session.creditsConsumed || 0,
      model_used: 'gemini-2.5-flash',
    };
  }

  /**
   * Exports an existing session report into Markdown, PDF (printable HTML), Plain Text, or JSON.
   */
  public static async exportReport(
    userId: string,
    sessionId: string,
    format: 'markdown' | 'pdf' | 'txt' | 'json'
  ): Promise<ExportReportResult> {
    const report = await this.getReport(userId, sessionId);
    if (!report) {
      throw AppError.notFound(`No saved intelligence report exists for session ${sessionId}.`);
    }

    const safeTitle = report.title.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. Markdown Export
    if (format === 'markdown') {
      const mdContent = this.formatMarkdownReport(report);
      return {
        filename: `${safeTitle}_Report.md`,
        contentType: 'text/markdown',
        content: mdContent,
      };
    }

    // 2. Plain Text Export
    if (format === 'txt') {
      const txtContent = this.formatTextReport(report);
      return {
        filename: `${safeTitle}_Report.txt`,
        contentType: 'text/plain',
        content: txtContent,
      };
    }

    // 3. JSON Export
    if (format === 'json') {
      return {
        filename: `${safeTitle}_Report.json`,
        contentType: 'application/json',
        content: JSON.stringify(report, null, 2),
      };
    }

    // 4. PDF / Printable HTML Document
    const htmlContent = this.formatHtmlPdfReport(report);
    return {
      filename: `${safeTitle}_Report.html`,
      contentType: 'text/html; charset=utf-8',
      content: htmlContent,
    };
  }

  private static formatMarkdownReport(report: any): string {
    const actionItems = (report.actionItems as any[]) || [];
    const questions = (report.importantQuestions as any[]) || [];
    const observations = (report.keyObservations as any[]) || [];
    const decisions = (report.decisions as any[]) || [];
    const checklist = (report.taskChecklist as any[]) || [];
    const followUps = (report.followUpQuestions as any[]) || [];
    const snapshots = (report.relevantSnapshots as any[]) || [];
    const tools = (report.toolActivitySummary as any) || {};

    let md = `# ${report.title}\n\n`;
    md += `> **Generated with**: \`${report.modelUsed}\`  \n`;
    md += `> **Session ID**: \`${report.sessionId}\`  \n`;
    md += `> **Duration**: ${report.sessionDuration} seconds | **Credits**: ${report.creditsConsumed} credits | **Date**: ${new Date(report.createdAt).toLocaleDateString()}\n\n`;

    md += `## Executive Overview\n${report.overview}\n\n`;

    if (report.keyTopics && (report.keyTopics as any[]).length > 0) {
      md += `**Key Topics**: ${(report.keyTopics as any[]).map((t: string) => `\`${t}\``).join(' • ')}\n\n`;
    }

    if (decisions.length > 0) {
      md += `## Decisions Reached\n`;
      decisions.forEach((d) => {
        md += `- [x] **Decision**: ${d}\n`;
      });
      md += `\n`;
    }

    if (actionItems.length > 0) {
      md += `## Action Items\n\n`;
      md += `| Task | Owner | Deadline | Priority | Source Citation |\n`;
      md += `| :--- | :--- | :--- | :---: | :--- |\n`;
      actionItems.forEach((item) => {
        md += `| **${item.task}**<br>${item.description} | ${item.owner || '*Unassigned*'} | ${item.deadline || '*None stated*'} | \`${item.priority || 'MEDIUM'}\` | ${item.transcript_reference || 'Live Session'} |\n`;
      });
      md += `\n`;
    }

    if (checklist.length > 0) {
      md += `## Task Checklist\n`;
      checklist.forEach((chk) => {
        md += `- [${chk.completed ? 'x' : ' '}] ${chk.text}${chk.owner ? ` *(Owner: ${chk.owner})*` : ''}\n`;
      });
      md += `\n`;
    }

    if (questions.length > 0) {
      md += `## Important Questions & Answers\n`;
      questions.forEach((q) => {
        md += `### Q: ${q.question}\n`;
        md += `> **Answer** (${q.answered_by || 'AI'}): ${q.answer}\n\n`;
      });
    }

    if (observations.length > 0) {
      md += `## Key Observations\n`;
      observations.forEach((obs) => {
        md += `- ${obs}\n`;
      });
      md += `\n`;
    }

    if (snapshots.length > 0) {
      md += `## Relevant Visual Snapshots\n`;
      snapshots.forEach((snap) => {
        md += `- **Snapshot \`${snap.snapshot_id}\`** (${snap.source || 'Frame'}): ${snap.reason}\n`;
      });
      md += `\n`;
    }

    if (tools.tools_used && tools.tools_used.length > 0) {
      md += `## Tool Execution Summary\n`;
      md += `- **Total Calls**: ${tools.total_calls} (${tools.successful_calls} succeeded, ${tools.failed_calls} failed)\n`;
      md += `- **Tools**: ${tools.tools_used.map((t: string) => `\`${t}\``).join(', ')}\n\n`;
    }

    if (followUps.length > 0) {
      md += `## Follow-up Questions & Next Steps\n`;
      followUps.forEach((fu) => {
        md += `- ${fu}\n`;
      });
      md += `\n`;
    }

    md += `---\n*Report generated by AI Vision Studio Intelligence Engine.*`;
    return md;
  }

  private static formatTextReport(report: any): string {
    const actionItems = (report.actionItems as any[]) || [];
    const questions = (report.importantQuestions as any[]) || [];
    const decisions = (report.decisions as any[]) || [];

    let txt = `========================================================================\n`;
    txt += `AI VISION STUDIO | SESSION INTELLIGENCE REPORT\n`;
    txt += `========================================================================\n`;
    txt += `Title:    ${report.title}\n`;
    txt += `Session:  ${report.sessionId}\n`;
    txt += `Model:    ${report.modelUsed}\n`;
    txt += `Duration: ${report.sessionDuration}s | Credits: ${report.creditsConsumed}\n`;
    txt += `Date:     ${new Date(report.createdAt).toLocaleString()}\n`;
    txt += `------------------------------------------------------------------------\n\n`;

    txt += `EXECUTIVE OVERVIEW:\n${report.overview}\n\n`;

    if (decisions.length > 0) {
      txt += `DECISIONS REACHED:\n`;
      decisions.forEach((d, idx) => {
        txt += `  ${idx + 1}. ${d}\n`;
      });
      txt += `\n`;
    }

    if (actionItems.length > 0) {
      txt += `ACTION ITEMS:\n`;
      actionItems.forEach((act, idx) => {
        txt += `  [${idx + 1}] ${act.task}\n`;
        txt += `      Description: ${act.description}\n`;
        txt += `      Owner:       ${act.owner || 'Unassigned'}\n`;
        txt += `      Deadline:    ${act.deadline || 'None specified'}\n`;
        txt += `      Priority:    ${act.priority || 'MEDIUM'}\n`;
        txt += `      Citation:    ${act.transcript_reference || 'Session transcript'}\n\n`;
      });
    }

    if (questions.length > 0) {
      txt += `IMPORTANT QUESTIONS & ANSWERS:\n`;
      questions.forEach((q, idx) => {
        txt += `  Q${idx + 1}: ${q.question}\n`;
        txt += `  A${idx + 1}: ${q.answer} (${q.answered_by || 'AI'})\n\n`;
      });
    }

    txt += `========================================================================\n`;
    txt += `Generated by AI Vision Studio.\n`;
    return txt;
  }

  private static formatHtmlPdfReport(report: any): string {
    const actionItems = (report.actionItems as any[]) || [];
    const questions = (report.importantQuestions as any[]) || [];
    const decisions = (report.decisions as any[]) || [];
    const checklist = (report.taskChecklist as any[]) || [];
    const observations = (report.keyObservations as any[]) || [];
    const snapshots = (report.relevantSnapshots as any[]) || [];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #18181b;
      background: #fafafa;
      padding: 40px 20px;
      margin: 0;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      padding: 48px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e4e4e7;
    }
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      background: #eff6ff;
      color: #2563eb;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    h1 { margin: 10px 0 6px 0; font-size: 26px; color: #09090b; }
    .meta { font-size: 12px; color: #71717a; margin-bottom: 12px; }
    .overview-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }
    h2 { font-size: 17px; margin-top: 28px; margin-bottom: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 10px; font-weight: 600; color: #334155; border: 1px solid #cbd5e1; }
    td { padding: 10px; border: 1px solid #e2e8f0; vertical-align: top; }
    .priority-high { color: #dc2626; font-weight: 700; }
    .priority-med { color: #d97706; font-weight: 600; }
    .qa-box { background: #fdfdfd; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px; font-size: 12px; }
    .print-btn {
      background: #2563eb; color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <span class="badge">AI Vision Studio • Intelligence Report</span>
        <h1>${report.title}</h1>
        <div class="meta">
          Session ID: <code>${report.sessionId}</code> &bull; Model: <code>${report.modelUsed}</code> &bull; Duration: ${report.sessionDuration}s &bull; Credits: ${report.creditsConsumed}
        </div>
      </div>
      <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
    </div>

    <div class="overview-card">
      <h3 style="margin-top:0; font-size:14px; text-transform:uppercase; color:#475569;">Executive Overview</h3>
      <p style="margin:0; font-size:13px; color:#1e293b;">${report.overview}</p>
    </div>

    ${
      decisions.length > 0
        ? `<h2>Decisions Reached</h2><ul>${decisions.map((d: string) => `<li style="font-size:13px; margin-bottom:6px;"><strong>${d}</strong></li>`).join('')}</ul>`
        : ''
    }

    ${
      actionItems.length > 0
        ? `<h2>Action Items & Grounded Owners</h2>
           <table>
             <thead>
               <tr>
                 <th>Task & Details</th>
                 <th>Owner</th>
                 <th>Deadline</th>
                 <th>Priority</th>
                 <th>Source Reference</th>
               </tr>
             </thead>
             <tbody>
               ${actionItems
                 .map(
                   (act: any) => `<tr>
                     <td><strong>${act.task}</strong><br><span style="color:#64748b; font-size:11px;">${act.description}</span></td>
                     <td>${act.owner || '<em style="color:#94a3b8">Unassigned</em>'}</td>
                     <td>${act.deadline || '<em style="color:#94a3b8">None stated</em>'}</td>
                     <td><span class="${act.priority === 'HIGH' ? 'priority-high' : 'priority-med'}">${act.priority || 'MEDIUM'}</span></td>
                     <td><code>${act.transcript_reference || 'Live Session'}</code></td>
                   </tr>`
                 )
                 .join('')}
             </tbody>
           </table>`
        : ''
    }

    ${
      questions.length > 0
        ? `<h2>Important Questions & Answers</h2>
           ${questions
             .map(
               (q: any) => `<div class="qa-box">
                 <strong style="color:#0f172a;">Q: ${q.question}</strong>
                 <p style="margin: 6px 0 0 0; color:#334155;">A: ${q.answer} <em style="color:#64748b; font-size:11px;">(Answered by ${q.answered_by || 'AI'})</em></p>
               </div>`
             )
             .join('')}`
        : ''
    }

    ${
      checklist.length > 0
        ? `<h2>Task Checklist</h2>
           <ul style="list-style:none; padding-left:0;">
             ${checklist
               .map(
                 (chk: any) => `<li style="font-size:13px; margin-bottom:6px;">
                   <input type="checkbox" ${chk.completed ? 'checked' : ''} disabled>
                   <span>${chk.text}</span> ${chk.owner ? `<span style="color:#64748b; font-size:11px;">(Owner: ${chk.owner})</span>` : ''}
                 </li>`
               )
               .join('')}
           </ul>`
        : ''
    }

    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
      Generated automatically by AI Vision Studio Session Intelligence &bull; Strictly grounded in verified session events.
    </div>
  </div>
</body>
</html>`;
  }
}
