// Generates fixtures/sample-handbook.pdf — a 3-page PDF with known text per page.
//
// The smoke test needs a document whose page boundaries are known in advance, so it can
// prove that document_chunks.page_number is genuinely correct and not just non-null.
// Each page below carries one distinctive fact, and each fact answers one of the app's
// own suggested questions — so the smoke test can ask a real question and assert the
// citation points at the right page.
//
// Written by hand rather than with a PDF library so the repo needs no extra dependency.
// Run: node scripts/fixtures/make-sample-pdf.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The one fact per page that the smoke test asserts against. */
export const PAGES = [
  {
    heading: "ACADEMIC HANDBOOK",
    lines: [
      "Section 1: Final Year Project Registration",
      "The minimum CGPA required for Final Year Project registration is 2.50.",
      "Students below this threshold must complete a remedial semester first.",
    ],
  },
  {
    heading: "ATTENDANCE POLICY",
    lines: [
      "Section 2: Course Attendance",
      "Students must maintain at least 75 percent attendance in every course.",
      "Falling below 75 percent bars a student from the final examination.",
    ],
  },
  {
    heading: "SCHOLARSHIPS",
    lines: [
      "Section 3: Merit Awards",
      "Merit scholarships are awarded to students with a CGPA above 3.75.",
      "Applications close on the fifteenth of March each academic year.",
    ],
  },
];

/** Escape the three characters that are special inside a PDF literal string. */
function pdfString(text) {
  return text.replace(/([\\()])/g, "\\$1");
}

function contentStream({ heading, lines }) {
  const body = lines
    .map((line) => `0 -28 Td (${pdfString(line)}) Tj`)
    .join("\n");
  return `BT
/F1 18 Tf
72 720 Td
(${pdfString(heading)}) Tj
/F1 12 Tf
${body}
ET
`;
}

function buildPdf(pages) {
  // Object layout: 1 = Catalog, 2 = Pages, then (page, content) per page, then the font.
  const fontId = 3 + pages.length * 2;
  const pageIds = pages.map((_, i) => 3 + i * 2);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  for (const [i, page] of pages.entries()) {
    const contentId = pageIds[i] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const stream = contentStream(page);
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
    );
  }

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  // Assemble, recording the byte offset of every object for the xref table.
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const [i, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }

  // xref entries are exactly 20 bytes each: 10-digit offset, space, 5-digit gen, space, type, space, newline.
  const startxref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), "sample-handbook.pdf");
writeFileSync(outPath, buildPdf(PAGES));
console.log(`wrote ${outPath} (${PAGES.length} pages)`);
