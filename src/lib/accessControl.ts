type AccessProfile = {
  company_id?: string | null;
  system_role?: string | null;
} | null | undefined;

function isCompanyAdminProfile(profile: AccessProfile) {
  return profile?.system_role === "admin" && Boolean(profile.company_id);
}

export function canCreatePleProject(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}

export function canDeletePleProject(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}

export function canImportInteractiveMap(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}

export function canEditInteractiveMap(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}

export function canDeleteInteractiveMap(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}

export function canManage3DMap(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}

export function canDelete3DAssets(profile: AccessProfile) {
  return isCompanyAdminProfile(profile);
}
