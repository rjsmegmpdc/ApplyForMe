import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { Packer } from 'docx';
import { FIXTURE_PROFILE } from '../../../../packages/engine/src/__fixtures__/profile';
import type { TailoredOutput } from '@applyforme/engine';
import { base64ToBytes, docxToBase64, findProfileRole, renderCvDocx, renderLetterDocx, safeFilename } from './docx';

const OUTPUT: TailoredOutput = {
  summary: 'Governance-first AI leader who turns curiosity into production systems.',
  highlights: [
    { role: 'Product Manager – Modern Workplace', company: 'One NZ (formerly Vodafone NZ)', bullets: ['Rolled out a Copilot Studio assistant.', 'Authored Zero Trust device standards.'] },
    { role: 'Manager Database Operations', company: 'ASB Bank', bullets: ['Ran 14,000+ databases 24x7.'] },
  ],
  coverLetter: { paragraphs: ['I am writing about the Head of Modern Workplace role at Kiwi Energy Group.', 'Warm regards paragraph.'] },
};
const JOB = { title: 'Head of Modern Workplace', company: 'Kiwi Energy Group' };

/**
 * Minimal ZIP reader — enough to pull one entry out of a .docx (central
 * directory → local header → raw deflate) so the tests can assert on the
 * actual document XML without a zip dependency.
 */
function zipEntry(buf: Buffer, name: string): string {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(0);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let p = cdOffset;
  while (buf.readUInt32LE(p) === 0x02014b50) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not found in zip`);
}

describe('renderCvDocx', () => {
  it('packs to a real .docx (PK header) whose document.xml carries the name, summary, bullets in order, dates from the profile, competencies and certifications', async () => {
    const doc = renderCvDocx(OUTPUT, FIXTURE_PROFILE, JOB);
    const buf = await Packer.toBuffer(doc);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');

    const xml = zipEntry(buf, 'word/document.xml');
    expect(xml).toContain('Matt Harkness');
    expect(xml).toContain('021 241 7033');
    expect(xml).toContain(OUTPUT.summary);
    expect(xml).toContain('PROFESSIONAL SUMMARY');
    expect(xml).toContain('CAREER HISTORY');
    expect(xml.indexOf('Rolled out a Copilot Studio assistant.')).toBeLessThan(xml.indexOf('Authored Zero Trust device standards.'));
    expect(xml).toContain('Nov 2021 – Present');
    expect(xml).toContain('2011 – 2017');
    expect(xml).toContain('Technology Roadmaps &amp; Domain Strategy');
    expect(xml).toContain('Foundations of Responsible AI');
    expect(xml).toContain('Calibri');
    expect(xml).toContain('1B365D');
  });

  it('roles the output omitted still appear (from the profile) after the tailored ones', async () => {
    const xml = zipEntry(await Packer.toBuffer(renderCvDocx(OUTPUT, FIXTURE_PROFILE, JOB)), 'word/document.xml');
    expect(xml.indexOf('Manager Database Operations')).toBeLessThan(xml.indexOf('Software Integration Capability Lead'));
    expect(xml).toContain('Earlier Career');
  });

  it('findProfileRole tolerates a shortened company / title', () => {
    expect(findProfileRole(FIXTURE_PROFILE, { role: 'Product Manager', company: 'One NZ' })?.start_date).toBe('Nov 2021');
    expect(findProfileRole(FIXTURE_PROFILE, { role: 'Product Owner – Integration', company: 'ASB' })?.start_date).toBe('2018');
    expect(findProfileRole(FIXTURE_PROFILE, { role: 'CEO', company: 'Nowhere Ltd' })).toBeNull();
  });
});

describe('renderLetterDocx', () => {
  it('uses the injected date, salutation, body paragraphs and sign-off', async () => {
    const buf = await Packer.toBuffer(renderLetterDocx(OUTPUT, FIXTURE_PROFILE, JOB, '13 September 2026'));
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    const xml = zipEntry(buf, 'word/document.xml');
    expect(xml).toContain('13 September 2026');
    expect(xml).toContain('Re: Head of Modern Workplace — Kiwi Energy Group');
    expect(xml).toContain('Dear Hiring Manager,');
    expect(xml).toContain(OUTPUT.coverLetter.paragraphs[0]);
    expect(xml).toContain('Yours sincerely,');
    expect(xml.lastIndexOf('Matt Harkness')).toBeGreaterThan(xml.indexOf('Yours sincerely,'));
  });
});

describe('docxToBase64 / base64ToBytes', () => {
  it('produces non-empty base64 that decodes back to PK bytes', async () => {
    const b64 = await docxToBase64(renderCvDocx(OUTPUT, FIXTURE_PROFILE, JOB));
    expect(b64.length).toBeGreaterThan(1000);
    expect(/^[A-Za-z0-9+/]+=*$/.test(b64)).toBe(true);
    const bytes = base64ToBytes(b64);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

describe('safeFilename', () => {
  it('slugs name and company, ASCII only', () => {
    expect(safeFilename('Matt Harkness', 'CV', 'Kiwi Energy Group')).toBe('Matt_Harkness_CV_Kiwi_Energy_Group.docx');
    expect(safeFilename('Zoë O\'Brien', 'Cover_Letter', 'One NZ (formerly Vodafone NZ)')).toBe('Zoe_O_Brien_Cover_Letter_One_NZ_formerly_Vodafone_NZ.docx');
    expect(safeFilename('', 'CV', '')).toBe('Candidate_CV_Application.docx');
    expect(safeFilename('x'.repeat(100), 'CV', 'y'.repeat(100)).length).toBeLessThan(100);
  });
});
