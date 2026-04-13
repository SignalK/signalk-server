/**
 * Bluetooth SIG assigned company identifiers (16-bit).
 *
 * Source: https://bitbucket.org/bluetooth-SIG/public/src/main/assigned_numbers/company_identifiers/
 * The JSON file contains all ~3,600 assigned company IDs.
 */

import companyData from './bleCompanyIds.json'

const BLE_COMPANY_IDS = new Map<number, string>()

for (const entry of companyData.company_identifiers) {
  BLE_COMPANY_IDS.set(entry.value, entry.name)
}

/**
 * Returns a vendor name for the given 16-bit Bluetooth company ID,
 * or undefined if unknown.
 */
export function bleVendorName(companyId: number): string | undefined {
  return BLE_COMPANY_IDS.get(companyId)
}
