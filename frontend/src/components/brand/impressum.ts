/**
 * Anbieterkennzeichnung nach § 5 DDG for the software vendor.
 *
 * This is the legal content itself and stays as written; the labels around
 * it (address kinds, "Contact", …) are translated in LegalDialog.
 */
export const IMPRESSUM = {
  basis: 'Angaben gemäß § 5 DDG',
  legalName: 'Protominds – Maximilian Hummel und Abdullah Shams GbR',
  representedBy: ['Maximilian Hummel', 'Abdullah Shams'],
  addresses: [
    { kind: 'business', lines: ['Kimplerstraße 294', '47807 Krefeld', 'Germany'] },
    { kind: 'further', lines: ['Carl-Rumpff Str. 10', '51373 Leverkusen', 'Germany'] },
  ],
  email: 'info@protominds.io',
  website: 'https://www.protominds.io/',
} as const;
