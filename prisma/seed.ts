import { PrismaClient, RoleCode, SpecialtyCode, ProfessionalStatus } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

const ROLES: { code: RoleCode; label: string }[] = [
  { code: 'CLIENT', label: 'Client' },
  { code: 'PROFESSIONAL', label: 'Électricien' },
  { code: 'EVALUATOR', label: 'Évaluateur' },
  { code: 'ADMIN', label: 'Administrateur' },
];

const SPECIALTIES: { code: SpecialtyCode; label: string; sortOrder: number }[] = [
  { code: 'BUILDING_REPAIR', label: 'Électricité bâtiment et dépannage', sortOrder: 1 },
  { code: 'INDUSTRIAL', label: 'Électricité industrielle et maintenance', sortOrder: 2 },
  { code: 'SOLAR_PV', label: 'Solaire photovoltaïque', sortOrder: 3 },
  { code: 'GENERATORS', label: 'Groupes électrogènes', sortOrder: 4 },
  {
    code: 'PANELS_THREE_PHASE',
    label: 'Tableaux électriques, installations triphasées et mise à la terre',
    sortOrder: 5,
  },
];

const TEST_ACCOUNTS: { phone: string; firstName: string; lastName: string; role: RoleCode }[] = [
  { phone: '+22900000001', firstName: 'Client', lastName: 'Test', role: 'CLIENT' },
  { phone: '+22900000002', firstName: 'Jean-Marc', lastName: 'Test', role: 'PROFESSIONAL' },
  { phone: '+22900000003', firstName: 'Évaluateur', lastName: 'Test', role: 'EVALUATOR' },
  { phone: '+22900000004', firstName: 'Admin', lastName: 'Test', role: 'ADMIN' },
];

type CommuneSeed = { code: string; name: string; department: string };

async function seedRoles() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label },
      create: role,
    });
  }
}

async function seedSpecialties() {
  for (const specialty of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { code: specialty.code },
      update: { label: specialty.label, sortOrder: specialty.sortOrder },
      create: specialty,
    });
  }
}

async function seedZones() {
  const file = readFileSync(join(__dirname, 'seed-data', 'communes.json'), 'utf8');
  const communes: CommuneSeed[] = JSON.parse(file);

  for (const commune of communes) {
    await prisma.serviceZone.upsert({
      where: { code: commune.code },
      update: { name: commune.name, department: commune.department },
      create: commune,
    });
  }
}

async function grantRole(userId: string, code: RoleCode) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

async function seedTestAccounts() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  for (const account of TEST_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { phone: account.phone },
      update: { firstName: account.firstName, lastName: account.lastName },
      create: {
        phone: account.phone,
        firstName: account.firstName,
        lastName: account.lastName,
      },
    });

    await grantRole(user.id, 'CLIENT');
    if (account.role !== 'CLIENT') {
      await grantRole(user.id, account.role);
    }

    if (account.role === 'PROFESSIONAL') {
      const specialties = await prisma.specialty.findMany({
        where: { code: { in: ['BUILDING_REPAIR', 'SOLAR_PV'] } },
      });
      const zones = await prisma.serviceZone.findMany({
        where: { code: { in: ['BJ-LIT-COTONOU', 'BJ-ATL-ABOMEY-CALAVI'] } },
      });

      const profile = await prisma.professionalProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          status: ProfessionalStatus.PENDING,
          experienceYears: 8,
          bio: 'Électricien bâtiment et solaire, zone Cotonou et Abomey-Calavi.',
        },
      });

      for (const specialty of specialties) {
        await prisma.professionalSpecialty.upsert({
          where: {
            profileId_specialtyId: { profileId: profile.id, specialtyId: specialty.id },
          },
          update: {},
          create: { profileId: profile.id, specialtyId: specialty.id },
        });
      }

      for (const zone of zones) {
        await prisma.professionalZone.upsert({
          where: { profileId_zoneId: { profileId: profile.id, zoneId: zone.id } },
          update: {},
          create: { profileId: profile.id, zoneId: zone.id },
        });
      }
    }
  }

  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    const admin = await prisma.user.upsert({
      where: { phone: adminPhone },
      update: {},
      create: { phone: adminPhone },
    });
    await grantRole(admin.id, 'CLIENT');
    await grantRole(admin.id, 'ADMIN');
  }
}

async function main() {
  await seedRoles();
  await seedSpecialties();
  await seedZones();
  await seedTestAccounts();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
