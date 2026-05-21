type AccessProfile = {
  company_id?: string | null;
  system_role?: string | null;
} | null | undefined;

export type Map3DAction =
  | "map3d.import_main_model"
  | "map3d.add_glb_part"
  | "map3d.manage_layers"
  | "map3d.link_services"
  | "map3d.assign_houses"
  | "map3d.review_model"
  | "map3d.smartlink"
  | "map3d.sync_real"
  | "map3d.view_real"
  | "map3d.view_simulation"
  | "map3d.reset_map"
  | "map3d.save_map"
  | "map3d.manage_glb_parts"
  | "map3d.walk_mode"
  | "map3d.change_zoom_sensitivity"
  | "map3d.performance_mode";

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
  return isCompanyAdminProfile(profile) || profile?.system_role === "system_admin";
}

export function canDelete3DAssets(profile: AccessProfile) {
  return isCompanyAdminProfile(profile) || profile?.system_role === "system_admin";
}

export function canUseMap3DAction(
  profile: AccessProfile,
  action: Map3DAction,
  canAccessManagement?: (sectionId: string) => boolean,
) {
  if (canManage3DMap(profile)) return true;
  return canAccessManagement?.(action) === true;
}
