export function assertOpeningDebitCreditExclusive(
  openingDebit: number,
  openingCredit: number,
  context?: string
) {
  const od = Number(openingDebit) || 0
  const oc = Number(openingCredit) || 0
  if (od > 0 && oc > 0) {
    const msg = '年初借方与年初贷方不能同时填写'
    throw new Error(context ? `${context}：${msg}` : msg)
  }
}

export function normalizeOpeningDebitCredit(openingDebit: number, openingCredit: number) {
  const od = Number(openingDebit) || 0
  const oc = Number(openingCredit) || 0
  if (od > 0 && oc > 0) {
    if (od >= oc) return { opening_debit: od, opening_credit: 0 }
    return { opening_debit: 0, opening_credit: oc }
  }
  return { opening_debit: od, opening_credit: oc }
}
