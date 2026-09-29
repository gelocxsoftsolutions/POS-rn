import { getDatabase, execute, queryFirst } from "./connection";
import { v4 as uuid } from "uuid";
import { sha256 } from "@/lib/crypto/ed25519";

const SAMPLE_PIN = "123456";
const SAMPLE_USERNAME = "sample";
const SAMPLE_EMPLOYEE_ID = "EMP-SAMPLE";
const OPENING_STOCK = 20;
const MINIMUM_STOCK = 5;
const MAXIMUM_STOCK = 100;
const LOCAL_DEVICE_CODE = "POS-LOCAL-001";
const LOCAL_BRANCH_ID = 1;
const LOCAL_BRANCH_NAME = "Main Branch";
const LOCAL_BRANCH_ADDRESS = "Manila, Philippines";

export function isSampleDataEnabled(): boolean {
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "staging";
  if (process.env.EXPO_PUBLIC_SEED_SAMPLE_DATA === "0") return false;
  return appEnv !== "production";
}

async function findIdBy(table: string, column: string, value: string): Promise<string | null> {
  const row = await queryFirst<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${column} = ?`,
    [value]
  );
  return row?.id ?? null;
}

async function ensureReferenceData(): Promise<{
  unitKg: string;
  unitPack: string;
  taxGroupId: string;
  categories: Record<string, string>;
}> {
  const now = new Date().toISOString();

  let unitKg = await findIdBy("Unit", "name", "Kilogram");
  if (!unitKg) {
    unitKg = uuid();
    await execute(
      `INSERT INTO Unit (id, name, abbreviation, active, createdAt) VALUES (?, 'Kilogram', 'kg', 1, ?)`,
      [unitKg, now]
    );
  }

  let unitPack = await findIdBy("Unit", "name", "Pack");
  if (!unitPack) {
    unitPack = uuid();
    await execute(
      `INSERT INTO Unit (id, name, abbreviation, active, createdAt) VALUES (?, 'Pack', 'pk', 1, ?)`,
      [unitPack, now]
    );
  }

  let taxGroupId = await findIdBy("TaxGroup", "name", "VAT 12%");
  if (!taxGroupId) {
    taxGroupId = uuid();
    await execute(
      `INSERT INTO TaxGroup (id, name, rate, type, active, createdAt) VALUES (?, 'VAT 12%', 0.12, 'exclusive', 1, ?)`,
      [taxGroupId, now]
    );
  }

  const categories: Record<string, string> = {};
  for (const name of ["Fresh Fish", "Shellfish", "Frozen Seafood"]) {
    const existing = await findIdBy("Category", "name", name);
    if (existing) {
      categories[name] = existing;
      continue;
    }
    const id = uuid();
    await execute(
      `INSERT INTO Category (id, name, active, createdAt) VALUES (?, ?, 1, ?)`,
      [id, name, now]
    );
    categories[name] = id;
  }

  return {
    unitKg,
    unitPack,
    taxGroupId,
    categories,
  };
}

async function ensureSampleCashier(): Promise<void> {
  const existing = await findIdBy("Cashier", "username", SAMPLE_USERNAME);
  if (existing) return;

  const now = new Date().toISOString();
  let roleId = await findIdBy("Role", "name", "Admin");
  if (!roleId) {
    roleId = uuid();
    await execute(
      `INSERT INTO Role (id, name, description, isSystem, createdAt) VALUES (?, 'Admin', 'Full access', 1, ?)`,
      [roleId, now]
    );
  }

  await execute(
    `INSERT INTO Cashier (id, employeeId, username, displayName, pinHash, roleId, active, pinLoginEnabled, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    [uuid(), SAMPLE_EMPLOYEE_ID, SAMPLE_USERNAME, "Sample Cashier", sha256(SAMPLE_PIN), roleId, now]
  );
}

interface SampleProduct {
  sku: string;
  productCode?: string;
  name: string;
  description: string;
  price: number;
  barcode: string;
  weight: number;
  unit: "kg" | "pack";
  category: "Fresh Fish" | "Shellfish" | "Frozen Seafood";
}

const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    sku: "FISH-TILA-001",
    productCode: "TILAPIA",
    name: "Tilapia (Whole)",
    description: "Fresh whole tilapia, cleaned and gutted",
    price: 285,
    barcode: "4800001000018",
    weight: 1,
    unit: "kg",
    category: "Fresh Fish",
  },
  {
    sku: "FISH-TILA-002",
    productCode: "TILAPIA",
    name: "Tilapia (Fillet)",
    description: "Boneless tilapia fillet, skinless",
    price: 165,
    barcode: "4800001000025",
    weight: 0.5,
    unit: "pack",
    category: "Fresh Fish",
  },
  {
    sku: "FISH-BANG-001",
    productCode: "BANGUS",
    name: "Bangus (Milkfish)",
    description: "Fresh milkfish, cleaned and scaled",
    price: 320,
    barcode: "4800001000032",
    weight: 1,
    unit: "kg",
    category: "Fresh Fish",
  },
  {
    sku: "FISH-BANG-002",
    productCode: "BANGUS",
    name: "Bangus (Belly-cut)",
    description: "Milkfish belly-cut, ideal for sinigang",
    price: 395,
    barcode: "4800001000049",
    weight: 1.2,
    unit: "kg",
    category: "Fresh Fish",
  },
  {
    sku: "FISH-SHRM-001",
    name: "Shrimp (Prawns)",
    description: "Frozen whole prawns, medium size",
    price: 250,
    barcode: "4800001000056",
    weight: 0.25,
    unit: "pack",
    category: "Shellfish",
  },
  {
    sku: "FISH-SQUD-001",
    name: "Squid (Frozen)",
    description: "Frozen squid tubes, cleaned",
    price: 275,
    barcode: "4800001000063",
    weight: 0.5,
    unit: "pack",
    category: "Frozen Seafood",
  },
  {
    sku: "FISH-POMF-001",
    name: "Pomfret (Silver)",
    description: "Silver pomfret, whole and fresh",
    price: 420,
    barcode: "4800001000070",
    weight: 0.8,
    unit: "kg",
    category: "Fresh Fish",
  },
  {
    sku: "FISH-TUNA-001",
    name: "Tuna (Skipjack)",
    description: "Skipjack tuna steak, fresh",
    price: 300,
    barcode: "4800001000087",
    weight: 1.5,
    unit: "kg",
    category: "Fresh Fish",
  },
  {
    sku: "FISH-MACK-001",
    name: "Mackerel (Rounds)",
    description: "Frozen mackerel rounds, skinless",
    price: 235,
    barcode: "4800001000094",
    weight: 0.4,
    unit: "pack",
    category: "Frozen Seafood",
  },
  {
    sku: "FISH-CRAB-001",
    name: "Crabs (Blue Crab)",
    description: "Live blue crab, medium size",
    price: 480,
    barcode: "4800001000100",
    weight: 1,
    unit: "kg",
    category: "Shellfish",
  },
];

async function seedProducts(reference: Awaited<ReturnType<typeof ensureReferenceData>>): Promise<Map<string, string>> {
  const now = new Date().toISOString();
  const productIds = new Map<string, string>();

  for (const product of SAMPLE_PRODUCTS) {
    const productId = uuid();
    productIds.set(product.sku, productId);
    const unitId = product.unit === "kg" ? reference.unitKg : reference.unitPack;
    const categoryId = reference.categories[product.category];

    await execute(
      `INSERT INTO Product (id, sku, productCode, name, description, categoryId, unitId, weight, taxGroupId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [
        productId,
        product.sku,
        product.productCode ?? null,
        product.name,
        product.description,
        categoryId,
        unitId,
        product.weight,
        reference.taxGroupId,
        now,
        now,
      ]
    );

    await execute(
      `INSERT INTO ProductPrice (id, productId, priceList, price, currency, active, createdAt, updatedAt)
       VALUES (?, ?, 'retail', ?, 'PHP', 1, ?, ?)`,
      [uuid(), productId, product.price, now, now]
    );

    await execute(
      `INSERT INTO Barcode (id, productId, barcode, type, active, createdAt) VALUES (?, ?, ?, 'primary', 1, ?)`,
      [uuid(), productId, product.barcode, now]
    );

    await execute(
      `INSERT INTO PosInventory (id, productId, allocatedQty, availableQty, reservedQty, soldQty, damagedQty, adjustmentQty, minimumStock, maximumStock, updatedAt)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
      [uuid(), productId, OPENING_STOCK, OPENING_STOCK, MINIMUM_STOCK, MAXIMUM_STOCK, now]
    );

    await execute(
      `INSERT INTO InventoryLedger (id, movementType, referenceNumber, productId, quantity, balanceBefore, balanceAfter, notes, createdByName, createdAt)
       VALUES (?, 'TRANSFER_IN', 'OPENING-STOCK', ?, ?, 0, ?, 'Sample opening stock', 'System Seed', ?)`,
      [uuid(), productId, OPENING_STOCK, OPENING_STOCK, now]
    );
  }

  return productIds;
}

async function seedTransfers(productIds: Map<string, string>): Promise<void> {
  const now = new Date().toISOString();

  const transfers: Array<{
    transferNumber: string;
    notes: string;
    items: Array<{ sku: string; allocatedQty: number; unit: string; remarks: string }>;
  }> = [
    {
      transferNumber: "TRF-SAMPLE-001",
      notes: "Sample delivery - morning catch",
      items: [
        { sku: "FISH-TILA-001", allocatedQty: 10, unit: "kg", remarks: "Whole tilapia, 10 boxes" },
        { sku: "FISH-SHRM-001", allocatedQty: 5, unit: "pk", remarks: "Prawns 250g x 5" },
        { sku: "FISH-POMF-001", allocatedQty: 8, unit: "kg", remarks: "Pomfret, 8 pieces" },
      ],
    },
    {
      transferNumber: "TRF-SAMPLE-002",
      notes: "Sample delivery - frozen and shellfish",
      items: [
        { sku: "FISH-BANG-001", allocatedQty: 12, unit: "kg", remarks: "Milkfish, 12 pieces" },
        { sku: "FISH-SQUD-001", allocatedQty: 6, unit: "pk", remarks: "Squid 500g x 6" },
        { sku: "FISH-CRAB-001", allocatedQty: 4, unit: "kg", remarks: "Blue crab, 4 pieces" },
      ],
    },
  ];

  for (const transfer of transfers) {
    const transferId = uuid();
    await execute(
      `INSERT INTO InventoryTransfer (id, transferNumber, sourceWarehouse, destinationPos, status, createdByName, approvedByName, notes, createdAt, approvedAt, updatedAt)
       VALUES (?, ?, 'MAIN-WAREHOUSE', 'NCT Seafoods POS - Main', 'IN_TRANSIT', 'Warehouse Admin', 'Warehouse Admin', ?, ?, ?, ?)`,
      [transferId, transfer.transferNumber, transfer.notes, now, now, now]
    );

    for (const item of transfer.items) {
      const productId = productIds.get(item.sku);
      if (!productId) continue;
      await execute(
        `INSERT INTO InventoryTransferItem (id, transferId, productId, allocatedQty, receivedQty, unit, remarks, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [uuid(), transferId, productId, item.allocatedQty, item.unit, item.remarks, now, now]
      );
    }
  }
}

export interface LocalDeviceRegistration {
  deviceId: string;
  deviceCode: string;
  publicIdentifier: string;
  branchId: number;
  branchName: string;
  branchAddress: string;
  deviceName: string;
}

export async function ensureLocalDeviceRegistration(): Promise<LocalDeviceRegistration | null> {
  if (!isSampleDataEnabled()) return null;

  await getDatabase();

  const existing = await queryFirst<{
    id: string;
    deviceCode: string | null;
    deviceName: string | null;
    publicIdentifier: string | null;
    branchId: number | null;
    branchName: string | null;
    branchAddress: string | null;
  }>("SELECT * FROM Device ORDER BY createdAt DESC LIMIT 1");

  if (existing) {
    return {
      deviceId: existing.id,
      deviceCode: existing.deviceCode ?? LOCAL_DEVICE_CODE,
      publicIdentifier: existing.publicIdentifier ?? `nctpos-local-${existing.id.slice(0, 8)}`,
      branchId: existing.branchId ?? LOCAL_BRANCH_ID,
      branchName: existing.branchName ?? LOCAL_BRANCH_NAME,
      branchAddress: existing.branchAddress ?? LOCAL_BRANCH_ADDRESS,
      deviceName: existing.deviceName ?? "NCT POS Terminal",
    };
  }

  const now = new Date().toISOString();
  const deviceId = uuid();
  const publicIdentifier = `nctpos-local-${deviceId.slice(0, 8)}`;

  await execute(
    `INSERT INTO Device (id, deviceCode, deviceName, publicIdentifier, branchId, branchName, branchAddress, status, provisionVersion, configVersion, registeredAt, createdAt, updatedAt)
     VALUES (?, ?, 'NCT POS Terminal', ?, ?, ?, ?, 'REGISTERED', 0, 0, ?, ?, ?)`,
    [deviceId, LOCAL_DEVICE_CODE, publicIdentifier, LOCAL_BRANCH_ID, LOCAL_BRANCH_NAME, LOCAL_BRANCH_ADDRESS, now, now, now]
  );

  return {
    deviceId,
    deviceCode: LOCAL_DEVICE_CODE,
    publicIdentifier,
    branchId: LOCAL_BRANCH_ID,
    branchName: LOCAL_BRANCH_NAME,
    branchAddress: LOCAL_BRANCH_ADDRESS,
    deviceName: "NCT POS Terminal",
  };
}

export async function seedSampleData(): Promise<{ seeded: boolean; productCount: number; transferCount: number }> {
  if (!isSampleDataEnabled()) {
    return { seeded: false, productCount: 0, transferCount: 0 };
  }

  await getDatabase();
  await ensureSampleCashier();

  const productCount = await queryFirst<{ c: number }>("SELECT COUNT(*) as c FROM Product");
  if ((productCount?.c ?? 0) > 0) {
    return { seeded: false, productCount: productCount?.c ?? 0, transferCount: 0 };
  }

  const reference = await ensureReferenceData();
  const productIds = await seedProducts(reference);
  await seedTransfers(productIds);

  return { seeded: true, productCount: SAMPLE_PRODUCTS.length, transferCount: 2 };
}
