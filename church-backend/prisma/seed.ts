/**
 * Seeds the permission catalog, the 6 core roles, the default role→permission
 * matrix (section C of the architecture doc), and one bootstrap Super Admin.
 *
 * Idempotent: safe to run again (upserts everywhere). Run with `npm run seed`.
 */
import { PrismaClient, PermissionScope } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const { NONE, OWN_RECORD, ASSIGNED_SESSION, OWN_STAGE, ALL } = PermissionScope;

// ---------------------------------------------------------------------------
// 1. Permission catalog — key, module, and every scope that MAY be granted
//    for it (used to validate per-user overrides in UsersService.setPermissions).
// ---------------------------------------------------------------------------
const PERMISSIONS: { key: string; module: string; allowedScopes: PermissionScope[]; description: string }[] = [
  { key: 'VIEW_CHILDREN', module: 'people', allowedScopes: [OWN_RECORD, OWN_STAGE, ALL], description: 'View children profiles' },
  { key: 'EDIT_CHILDREN', module: 'people', allowedScopes: [OWN_STAGE, ALL], description: 'Create/edit/transfer children' },
  { key: 'VIEW_SERVANTS', module: 'people', allowedScopes: [OWN_STAGE, ALL], description: 'View servant profiles' },
  { key: 'EDIT_SERVANTS', module: 'people', allowedScopes: [ALL], description: 'Create/edit servants and assignments' },
  { key: 'MANAGE_STAGE', module: 'stages', allowedScopes: [OWN_STAGE, ALL], description: 'Create/edit stages & classes' },
  { key: 'CREATE_ATTENDANCE_SESSION', module: 'attendance', allowedScopes: [OWN_STAGE, ALL], description: 'Open attendance sessions & assign the recording servant' },
  { key: 'TAKE_ATTENDANCE', module: 'attendance', allowedScopes: [ASSIGNED_SESSION, OWN_STAGE, ALL], description: 'Record attendance (scan/manual)' },
  { key: 'EDIT_ATTENDANCE', module: 'attendance', allowedScopes: [OWN_STAGE, ALL], description: 'Correct an existing attendance record' },
  { key: 'VIEW_ATTENDANCE', module: 'attendance', allowedScopes: [OWN_RECORD, ASSIGNED_SESSION, OWN_STAGE, ALL], description: 'View attendance records/sessions' },
  { key: 'VIEW_ABSENCE_ALERTS', module: 'attendance', allowedScopes: [OWN_STAGE, ALL], description: 'View children absent beyond the configured threshold' },
  { key: 'RECORD_CONFESSION', module: 'confession', allowedScopes: [ALL], description: 'Record a confession event (priest)' },
  { key: 'VIEW_CONFESSION', module: 'confession', allowedScopes: [OWN_RECORD, ALL], description: 'View confession dates (never content)' },
  { key: 'VIEW_ISCORE', module: 'iscore', allowedScopes: [OWN_RECORD, OWN_STAGE, ALL], description: 'View iScore points/levels' },
  { key: 'ADJUST_ISCORE', module: 'iscore', allowedScopes: [ALL], description: 'Manually adjust a child score (reversal event)' },
  { key: 'MANAGE_SCORE_RULES', module: 'iscore', allowedScopes: [ALL], description: 'Edit score rules & levels' },
  { key: 'MANAGE_WEEKLY_ASSIGNMENTS', module: 'weekly', allowedScopes: [OWN_STAGE, ALL], description: 'Edit weekly service plans' },
  { key: 'VIEW_WEEKLY_ASSIGNMENTS', module: 'weekly', allowedScopes: [OWN_STAGE, ALL], description: 'View weekly service plans' },
  { key: 'MANAGE_PREPARATIONS', module: 'preparations', allowedScopes: [OWN_RECORD, OWN_STAGE], description: 'Create/edit own preparation notebook' },
  { key: 'VIEW_PREPARATIONS', module: 'preparations', allowedScopes: [OWN_RECORD, OWN_STAGE, ALL], description: 'View preparations' },
  { key: 'SEND_NEWS_CHURCH', module: 'notifications', allowedScopes: [ALL], description: 'Send church-wide news' },
  { key: 'SEND_NEWS_STAGE', module: 'notifications', allowedScopes: [OWN_STAGE, ALL], description: 'Send news scoped to one stage' },
  { key: 'VIEW_NOTIFICATIONS', module: 'notifications', allowedScopes: [OWN_RECORD], description: 'View own notification inbox' },
  { key: 'ASK_QUESTION', module: 'questions', allowedScopes: [OWN_RECORD], description: 'Submit an anonymous question' },
  { key: 'ANSWER_QUESTIONS', module: 'questions', allowedScopes: [ASSIGNED_SESSION, OWN_STAGE, ALL], description: 'Answer questions (subject to question_answer_permissions)' },
  { key: 'MANAGE_QUESTION_ACCESS', module: 'questions', allowedScopes: [ALL], description: 'Decide who may answer questions' },
  { key: 'REVEAL_QUESTION_OWNER', module: 'questions', allowedScopes: [ALL], description: 'Reveal the real identity behind an anonymous question' },
  { key: 'VIEW_REPORTS', module: 'reports', allowedScopes: [OWN_RECORD, OWN_STAGE, ALL], description: 'View reports' },
  { key: 'EXPORT_REPORTS', module: 'reports', allowedScopes: [OWN_STAGE, ALL], description: 'Export reports to PDF/Excel/CSV' },
  { key: 'PRINT_QR', module: 'qr', allowedScopes: [OWN_STAGE, ALL], description: 'Print / reprint QR codes' },
  { key: 'MANAGE_USERS', module: 'admin', allowedScopes: [ALL], description: 'Create/edit/disable users' },
  { key: 'MANAGE_ROLES', module: 'admin', allowedScopes: [ALL], description: 'Assign roles & permission overrides' },
  { key: 'MANAGE_DEVICES', module: 'admin', allowedScopes: [ALL], description: 'View/revoke devices' },
  { key: 'MANAGE_SETTINGS', module: 'admin', allowedScopes: [ALL], description: 'Edit system settings' },
  { key: 'VIEW_AUDIT', module: 'admin', allowedScopes: [ALL], description: 'View audit logs' },
];

// ---------------------------------------------------------------------------
// 2. Core roles (is_system = true: cannot be deleted from the dashboard)
// ---------------------------------------------------------------------------
const ROLES = [
  { key: 'super_admin', nameAr: 'مدير النظام العام', nameEn: 'Super Admin' },
  { key: 'priest', nameAr: 'الأب الكاهن', nameEn: 'Priest' },
  { key: 'general_secretary', nameAr: 'أمين الخدمة العام', nameEn: 'General Service Secretary' },
  { key: 'stage_secretary', nameAr: 'أمين المرحلة', nameEn: 'Stage Secretary' },
  { key: 'servant', nameAr: 'خادم', nameEn: 'Servant' },
  { key: 'child', nameAr: 'مخدوم', nameEn: 'Child' },
];

// ---------------------------------------------------------------------------
// 3. Default matrix — section C of the architecture doc.
//    '—' cells are simply omitted.
// ---------------------------------------------------------------------------
const MATRIX: Record<string, Record<string, PermissionScope>> = {
  priest: {
    VIEW_CHILDREN: ALL, VIEW_SERVANTS: ALL, VIEW_ATTENDANCE: ALL, VIEW_ABSENCE_ALERTS: ALL,
    RECORD_CONFESSION: ALL, VIEW_CONFESSION: ALL, VIEW_ISCORE: ALL, VIEW_WEEKLY_ASSIGNMENTS: ALL,
    SEND_NEWS_CHURCH: ALL, SEND_NEWS_STAGE: ALL, VIEW_NOTIFICATIONS: OWN_RECORD,
    ANSWER_QUESTIONS: ALL, MANAGE_QUESTION_ACCESS: ALL, VIEW_REPORTS: ALL, EXPORT_REPORTS: ALL,
  },
  general_secretary: {
    VIEW_CHILDREN: ALL, EDIT_CHILDREN: ALL, VIEW_SERVANTS: ALL, EDIT_SERVANTS: ALL, MANAGE_STAGE: ALL,
    CREATE_ATTENDANCE_SESSION: ALL, TAKE_ATTENDANCE: ALL, EDIT_ATTENDANCE: ALL, VIEW_ATTENDANCE: ALL,
    VIEW_ABSENCE_ALERTS: ALL, VIEW_ISCORE: ALL, MANAGE_WEEKLY_ASSIGNMENTS: ALL, VIEW_WEEKLY_ASSIGNMENTS: ALL,
    VIEW_PREPARATIONS: ALL, SEND_NEWS_CHURCH: ALL, SEND_NEWS_STAGE: ALL, VIEW_NOTIFICATIONS: OWN_RECORD,
    ANSWER_QUESTIONS: ALL, VIEW_REPORTS: ALL, EXPORT_REPORTS: ALL, PRINT_QR: ALL,
  },
  stage_secretary: {
    VIEW_CHILDREN: OWN_STAGE, EDIT_CHILDREN: OWN_STAGE, VIEW_SERVANTS: OWN_STAGE, MANAGE_STAGE: OWN_STAGE,
    CREATE_ATTENDANCE_SESSION: OWN_STAGE, TAKE_ATTENDANCE: OWN_STAGE, EDIT_ATTENDANCE: OWN_STAGE,
    VIEW_ATTENDANCE: OWN_STAGE, VIEW_ABSENCE_ALERTS: OWN_STAGE, VIEW_ISCORE: OWN_STAGE,
    MANAGE_WEEKLY_ASSIGNMENTS: OWN_STAGE, VIEW_WEEKLY_ASSIGNMENTS: OWN_STAGE,
    MANAGE_PREPARATIONS: OWN_RECORD, VIEW_PREPARATIONS: OWN_STAGE, SEND_NEWS_STAGE: OWN_STAGE,
    VIEW_NOTIFICATIONS: OWN_RECORD, ANSWER_QUESTIONS: OWN_STAGE, VIEW_REPORTS: OWN_STAGE,
    EXPORT_REPORTS: OWN_STAGE, PRINT_QR: OWN_STAGE,
  },
  servant: {
    VIEW_CHILDREN: OWN_STAGE, TAKE_ATTENDANCE: ASSIGNED_SESSION, VIEW_ATTENDANCE: ASSIGNED_SESSION,
    MANAGE_PREPARATIONS: OWN_RECORD, VIEW_PREPARATIONS: OWN_RECORD, VIEW_WEEKLY_ASSIGNMENTS: OWN_STAGE,
    VIEW_NOTIFICATIONS: OWN_RECORD, ANSWER_QUESTIONS: ASSIGNED_SESSION, VIEW_REPORTS: OWN_STAGE,
  },
  child: {
    VIEW_CHILDREN: OWN_RECORD, VIEW_ATTENDANCE: OWN_RECORD, VIEW_CONFESSION: OWN_RECORD, VIEW_ISCORE: OWN_RECORD,
    VIEW_NOTIFICATIONS: OWN_RECORD, ASK_QUESTION: OWN_RECORD, VIEW_REPORTS: OWN_RECORD,
  },
};

async function main() {
  console.log('Seeding permissions...');
  const permByKey = new Map<string, { id: string }>();
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, description: p.description, allowedScopes: p.allowedScopes },
      create: { key: p.key, module: p.module, description: p.description, allowedScopes: p.allowedScopes },
    });
    permByKey.set(p.key, row);
  }

  console.log('Seeding roles...');
  const roleByKey = new Map<string, { id: string }>();
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { key: r.key },
      update: { nameAr: r.nameAr, nameEn: r.nameEn, isSystem: true },
      create: { key: r.key, nameAr: r.nameAr, nameEn: r.nameEn, isSystem: true },
    });
    roleByKey.set(r.key, row);
  }

  console.log('Seeding role_permissions matrix...');
  // super_admin gets everything at ALL scope, regardless of the matrix above.
  for (const key of PERMISSIONS.map((p) => p.key)) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleByKey.get('super_admin')!.id, permissionId: permByKey.get(key)!.id } },
      update: { scope: ALL },
      create: { roleId: roleByKey.get('super_admin')!.id, permissionId: permByKey.get(key)!.id, scope: ALL },
    });
  }
  for (const [roleKey, perms] of Object.entries(MATRIX)) {
    for (const [permKey, scope] of Object.entries(perms)) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleByKey.get(roleKey)!.id, permissionId: permByKey.get(permKey)!.id } },
        update: { scope },
        create: { roleId: roleByKey.get(roleKey)!.id, permissionId: permByKey.get(permKey)!.id, scope },
      });
    }
  }

  console.log('Seeding bootstrap super admin...');
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!12345';
  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword: true,
      status: 'active',
    },
  });
  const alreadySuperAdmin = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: roleByKey.get('super_admin')!.id, validTo: null },
  });
  if (!alreadySuperAdmin) {
    await prisma.userRole.create({ data: { userId: admin.id, roleId: roleByKey.get('super_admin')!.id } });
  }

  console.log(`Done. Bootstrap super admin: username="${username}"${process.env.SEED_ADMIN_PASSWORD ? '' : ` password="${password}" (CHANGE THIS — set SEED_ADMIN_PASSWORD in production)`}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
