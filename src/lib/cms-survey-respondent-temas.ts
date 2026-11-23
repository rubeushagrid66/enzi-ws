/**
 * CMS survey respondents -> tema codes they mentioned.
 *
 * Generated from the "Hitung DVF - Cash - D (updated)" sheet
 * (1RFrDNK4LRi8apS--0H9IIf8tPncMLoPP2ZxK3T-2XY4), tab "Mapping Survey"
 * (respondent ID -> "Kode tema", ";"-separated). Only the 48 mapped
 * respondents are listed; the 17 unmapped ones mention no tema and
 * contribute 0 to the porsi-weighted survey count.
 *
 * Used by the CMS sheet-model D (scoring.ts): a respondent counts
 * toward an initiative in proportion to the temas they mentioned
 * that the initiative touches, capped at 1 per respondent.
 * Regenerate with ~/workspace/gen_cms_d_maps.py if the sheet changes.
 */
export const CMS_SURVEY_RESPONDENT_TEMAS: Record<string, string[]> = {
  "3": ["SYS-P01", "SYS-P02"],
  "4": ["USR-P01"],
  "5": ["USR-P01"],
  "9": ["AUT-P01"],
  "10": ["SYS-P02", "STS-P07", "USR-P01"],
  "13": ["UIX-P01"],
  "14": ["SYS-P03"],
  "15": ["SYS-P03", "UIX-P01", "AUT-P01"],
  "17": ["AUT-P01"],
  "18": ["SYS-P03"],
  "29": ["UIX-P01"],
  "32": ["SYS-P01", "SYS-P02"],
  "33": ["FTR-P01", "USR-P01"],
  "35": ["INT-P01"],
  "36": ["USR-P01"],
  "38": ["UIX-P01"],
  "40": ["SYS-P01", "SYS-P02", "USR-P01"],
  "45": ["SYS-P01", "SYS-P02"],
  "46": ["SYS-P03"],
  "48": ["SYS-P01", "SYS-P02"],
  "52": ["SYS-P01"],
  "53": ["SYS-P01"],
  "58": ["RPT-P06"],
  "60": ["SYS-P02"],
  "62": ["SYS-P01", "SYS-P02"],
  "65": ["INP-P03"],
  "67": ["RPT-P06"],
  "73": ["FTR-P01"],
  "74": ["SYS-P03"],
  "80": ["RPT-P01", "SYS-P02"],
  "86": ["RPT-P01"],
  "88": ["USR-P01"],
  "95": ["FTR-P01"],
  "115": ["USR-P01"],
  "122": ["RPT-P03", "FTR-P01", "SYS-P01", "SYS-P02"],
  "123": ["SYS-P01", "SYS-P02"],
  "124": ["FTR-P01"],
  "125": ["SYS-P01", "SYS-P02"],
  "128": ["SYS-P02"],
  "129": ["AUT-P01"],
  "130": ["SYS-P03"],
  "131": ["DSH-P03"],
  "132": ["SYS-P01", "SYS-P02"],
  "136": ["SYS-P01"],
  "137": ["RPT-P03", "SYS-P01", "SYS-P02"],
  "138": ["FTR-P01", "INP-P01"],
  "139": ["FTR-P01"],
  "140": ["FTR-P01"],
};
