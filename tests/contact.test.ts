import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { contactSchema } from '../src/validators/contact.validator.js';

describe('Prompt 26 — Public Contact & Support Validator Suite', () => {
  test('contactSchema: validates proper contact inquiry payload', () => {
    const valid = contactSchema.safeParse({
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      subject: 'Inquiry regarding Enterprise Multimodal Workspace',
      category: 'Enterprise Inquiry',
      message: 'Hello, we would like to evaluate AI Vision Studio for our team of 50 engineers. What concurrency limits are supported?',
    });

    assert.ok(valid.success, 'Valid submission must succeed');
    if (valid.success) {
      assert.equal(valid.data.name, 'Alex Rivera');
      assert.equal(valid.data.category, 'Enterprise Inquiry');
    }
  });

  test('contactSchema: rejects invalid email address', () => {
    const invalidEmail = contactSchema.safeParse({
      name: 'Alex Rivera',
      email: 'not-an-email',
      subject: 'Technical query',
      category: 'Technical Issue',
      message: 'This is a test message that exceeds 10 characters.',
    });

    assert.ok(!invalidEmail.success, 'Invalid email must fail');
  });

  test('contactSchema: rejects too-short message', () => {
    const shortMsg = contactSchema.safeParse({
      name: 'Alex Rivera',
      email: 'alex@example.com',
      subject: 'Hello',
      category: 'General Question',
      message: 'Hi',
    });

    assert.ok(!shortMsg.success, 'Message shorter than 10 characters must fail');
  });

  test('contactSchema: rejects invalid category enum', () => {
    const badCat = contactSchema.safeParse({
      name: 'Alex Rivera',
      email: 'alex@example.com',
      subject: 'Subject is long enough',
      category: 'FAKE_CATEGORY_XYZ',
      message: 'This is a valid message length exceeding 10 characters.',
    });

    assert.ok(!badCat.success, 'Unsupported category must fail');
  });
});
