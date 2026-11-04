export interface LicensedPackage {
  name: string;
  version: string;
  license: unknown;
}

export function isAllowedLicenseExpression(expression: unknown): boolean;
export function assertAllowedLicenses(
  packages: readonly LicensedPackage[],
): void;
