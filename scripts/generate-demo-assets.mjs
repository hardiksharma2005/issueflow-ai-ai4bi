// Generates the demo screenshots and the sample WhatsApp ZIP export in public/demo/.
// Run: npm run demo:assets   (requires the dev dependency "sharp")
//
// The images are synthetic mock-ups drawn from SVG (no real customer data).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

const OUT = path.resolve("public/demo");
const CHAT = "WhatsApp Chat with Bloom Retail Support.txt";
const W = 390;
const H = 760;

const font = `font-family="Segoe UI, Helvetica, Arial, sans-serif"`;
const phone = (body, title = "bloomretail.example") => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#f6f6f4"/>
  <rect width="100%" height="44" fill="#ffffff"/>
  <text x="16" y="28" ${font} font-size="13" fill="#111">9:17</text>
  <text x="${W - 16}" y="28" ${font} font-size="12" fill="#111" text-anchor="end">4G ▮▮▮ 62%</text>
  <rect x="12" y="50" width="${W - 24}" height="30" rx="15" fill="#e9e9e6"/>
  <text x="${W / 2}" y="70" ${font} font-size="12" fill="#555" text-anchor="middle">🔒 ${title}</text>
  ${body}
</svg>`;

const screenshots = {
  // Payment error on checkout
  "IMG-20261103-WA0001.jpg": phone(`
    <text x="20" y="120" ${font} font-size="20" font-weight="700" fill="#111">Checkout</text>
    <rect x="20" y="140" width="${W - 40}" height="86" rx="10" fill="#fdecec" stroke="#e5484d"/>
    <text x="36" y="170" ${font} font-size="15" font-weight="700" fill="#b4232a">Payment failed</text>
    <text x="36" y="194" ${font} font-size="13" fill="#b4232a">Payment gateway timeout (code 504).</text>
    <text x="36" y="213" ${font} font-size="13" fill="#b4232a">Your order has not been placed.</text>
    <rect x="20" y="246" width="${W - 40}" height="150" rx="10" fill="#fff" stroke="#ddd"/>
    <text x="36" y="276" ${font} font-size="14" fill="#333">Linen summer dress × 1</text>
    <text x="${W - 36}" y="276" ${font} font-size="14" fill="#333" text-anchor="end">₹2,499</text>
    <text x="36" y="306" ${font} font-size="14" fill="#333">Delivery</text>
    <text x="${W - 36}" y="306" ${font} font-size="14" fill="#333" text-anchor="end">₹99</text>
    <line x1="36" y1="326" x2="${W - 36}" y2="326" stroke="#eee"/>
    <text x="36" y="360" ${font} font-size="16" font-weight="700" fill="#111">Total</text>
    <text x="${W - 36}" y="360" ${font} font-size="16" font-weight="700" fill="#111" text-anchor="end">₹2,598</text>
    <rect x="20" y="430" width="${W - 40}" height="50" rx="10" fill="#2f6f4f"/>
    <text x="${W / 2}" y="461" ${font} font-size="16" font-weight="700" fill="#fff" text-anchor="middle">Pay now</text>
    <text x="${W / 2}" y="510" ${font} font-size="12" fill="#888" text-anchor="middle">Secured by PayFast · ref 7Q2-118</text>`),

  // Add to cart overlapping the price on a small screen
  "IMG-20261103-WA0002.jpg": phone(`
    <rect x="20" y="100" width="${W - 40}" height="300" rx="12" fill="#e8e2d8"/>
    <text x="${W / 2}" y="260" ${font} font-size="14" fill="#9a8f80" text-anchor="middle">[ product photo ]</text>
    <text x="20" y="436" ${font} font-size="18" font-weight="700" fill="#111">Linen summer dress</text>
    <text x="20" y="476" ${font} font-size="22" font-weight="700" fill="#111">₹2,499</text>
    <rect x="70" y="452" width="200" height="44" rx="8" fill="#2f6f4f" opacity="0.95"/>
    <text x="170" y="480" ${font} font-size="15" font-weight="700" fill="#fff" text-anchor="middle">Add to cart</text>
    <text x="20" y="530" ${font} font-size="13" fill="#666">Free delivery over ₹1,999 · Easy returns</text>
    <rect x="20" y="560" width="${W - 40}" height="1" fill="#ddd"/>
    <text x="20" y="590" ${font} font-size="12" fill="#999">iPhone SE · 375 px wide</text>`),

  // Out-of-stock products ranked first in search
  "IMG-20261105-WA0003.jpg": phone(
    `
    <rect x="20" y="96" width="${W - 40}" height="40" rx="8" fill="#fff" stroke="#ccc"/>
    <text x="34" y="121" ${font} font-size="14" fill="#333">🔍 linen dress</text>
    <text x="20" y="166" ${font} font-size="13" fill="#666">48 results · sorted by Relevance</text>
    ${[
      ["Linen wrap dress", "Out of stock", "#b4232a"],
      ["Linen midi dress", "Out of stock", "#b4232a"],
      ["Linen shirt dress", "Out of stock", "#b4232a"],
      ["Linen summer dress", "In stock", "#2f6f4f"],
    ]
      .map(
        ([name, stock, color], i) => `
      <rect x="20" y="${186 + i * 110}" width="${W - 40}" height="96" rx="10" fill="#fff" stroke="#e3e3e3"/>
      <rect x="32" y="${198 + i * 110}" width="72" height="72" rx="6" fill="#e8e2d8"/>
      <text x="118" y="${224 + i * 110}" ${font} font-size="15" font-weight="600" fill="#111">${name}</text>
      <text x="118" y="${248 + i * 110}" ${font} font-size="13" fill="#333">₹2,199</text>
      <text x="118" y="${270 + i * 110}" ${font} font-size="13" font-weight="700" fill="${color}">${stock}</text>`,
      )
      .join("")}`,
    "bloomretail.example/search",
  ),
};

// A screenshot uploaded separately (not inside the ZIP) to demonstrate loose evidence.
const loose = {
  "slow-category-page-load.png": phone(
    `
    <text x="20" y="120" ${font} font-size="20" font-weight="700" fill="#111">Dresses</text>
    ${[0, 1, 2, 3]
      .map((i) => `<rect x="${20 + (i % 2) * 180}" y="${140 + Math.floor(i / 2) * 230}" width="170" height="210" rx="10" fill="#e9e9e6"/>`)
      .join("")}
    <circle cx="${W / 2}" cy="640" r="18" fill="none" stroke="#2f6f4f" stroke-width="4" stroke-dasharray="80 40"/>
    <text x="${W / 2}" y="690" ${font} font-size="13" fill="#555" text-anchor="middle">Loading images… 9.8 s</text>`,
    "bloomretail.example/c/dresses",
  ),
};

async function render(svg, file) {
  const img = sharp(Buffer.from(svg));
  const buf = file.endsWith(".png") ? await img.png().toBuffer() : await img.jpeg({ quality: 82 }).toBuffer();
  await writeFile(path.join(OUT, file), buf);
  return buf;
}

const zip = new JSZip();
zip.file(CHAT, await readFile(path.join(OUT, CHAT)));
for (const [file, svg] of Object.entries(screenshots)) zip.file(file, await render(svg, file));
for (const [file, svg] of Object.entries(loose)) await render(svg, file);
// DOC-20261106-WA0004.pdf is intentionally NOT included: it demonstrates "missing attachment" handling.

const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
await writeFile(path.join(OUT, "WhatsApp Chat with Bloom Retail Support.zip"), zipBuf);
console.log(`Wrote ${Object.keys(screenshots).length + Object.keys(loose).length} images and the sample ZIP to ${OUT}`);
