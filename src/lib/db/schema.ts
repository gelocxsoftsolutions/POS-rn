export const SCHEMA_VERSION = 2;

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS Device (
    id TEXT PRIMARY KEY,
    deviceCode TEXT,
    deviceName TEXT,
    publicIdentifier TEXT UNIQUE,
    branchId INTEGER,
    branchName TEXT,
    branchAddress TEXT,
    status TEXT DEFAULT 'PENDING',
    provisionVersion INTEGER DEFAULT 0,
    configVersion INTEGER DEFAULT 0,
    registeredAt TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS Role (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    isSystem INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS Permission (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    "group" TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS RolePermission (
    roleId TEXT NOT NULL,
    permissionId TEXT NOT NULL,
    PRIMARY KEY (roleId, permissionId),
    FOREIGN KEY (roleId) REFERENCES Role(id) ON DELETE CASCADE,
    FOREIGN KEY (permissionId) REFERENCES Permission(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS Cashier (
    id TEXT PRIMARY KEY,
    employeeId TEXT UNIQUE,
    username TEXT UNIQUE,
    displayName TEXT NOT NULL,
    pinHash TEXT,
    passwordHash TEXT,
    roleId TEXT,
    active INTEGER DEFAULT 1,
    pinLoginEnabled INTEGER DEFAULT 1,
    passwordLoginEnabled INTEGER DEFAULT 0,
    lastLogin TEXT,
    lastActivity TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (roleId) REFERENCES Role(id)
  )`,

  `CREATE TABLE IF NOT EXISTS CashierSession (
    id TEXT PRIMARY KEY,
    cashierId TEXT NOT NULL,
    cashierName TEXT,
    cashierRole TEXT,
    roleId TEXT,
    loginType TEXT DEFAULT 'pin',
    loginTime TEXT DEFAULT (datetime('now')),
    logoutTime TEXT,
    lastActivity TEXT,
    deviceId TEXT,
    deviceName TEXT,
    currentShiftId TEXT,
    active INTEGER DEFAULT 1,
    locked INTEGER DEFAULT 0,
    lockedAt TEXT,
    FOREIGN KEY (cashierId) REFERENCES Cashier(id)
  )`,

  `CREATE TABLE IF NOT EXISTS Shift (
    id TEXT PRIMARY KEY,
    shiftNumber TEXT UNIQUE,
    cashierId TEXT,
    cashierName TEXT,
    deviceId TEXT,
    deviceName TEXT,
    branchId INTEGER,
    branchName TEXT,
    openedAt TEXT DEFAULT (datetime('now')),
    closedAt TEXT,
    openingFloat REAL DEFAULT 0,
    expectedCash REAL,
    actualCash REAL,
    difference REAL,
    notes TEXT,
    status TEXT DEFAULT 'OPEN',
    FOREIGN KEY (cashierId) REFERENCES Cashier(id)
  )`,

  `CREATE TABLE IF NOT EXISTS ShiftEvent (
    id TEXT PRIMARY KEY,
    shiftId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    description TEXT,
    cashierId TEXT,
    cashierName TEXT,
    metadata TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (shiftId) REFERENCES Shift(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS AuditLog (
    id TEXT PRIMARY KEY,
    eventType TEXT NOT NULL,
    description TEXT,
    cashierId TEXT,
    cashierName TEXT,
    roleId TEXT,
    ipAddress TEXT,
    metadata TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS Category (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT,
    description TEXT,
    parentId TEXT,
    sortOrder INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS Brand (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT,
    description TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS Unit (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    abbreviation TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS TaxGroup (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    rate REAL DEFAULT 0,
    type TEXT DEFAULT 'inclusive',
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS Product (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    productCode TEXT,
    name TEXT NOT NULL,
    description TEXT,
    categoryId TEXT,
    brandId TEXT,
    unitId TEXT,
    taxGroupId TEXT,
    status TEXT DEFAULT 'ACTIVE',
    imageId TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (categoryId) REFERENCES Category(id),
    FOREIGN KEY (brandId) REFERENCES Brand(id),
    FOREIGN KEY (unitId) REFERENCES Unit(id),
    FOREIGN KEY (taxGroupId) REFERENCES TaxGroup(id)
  )`,

  `CREATE TABLE IF NOT EXISTS ProductPrice (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    priceList TEXT DEFAULT 'retail',
    price REAL DEFAULT 0,
    currency TEXT DEFAULT 'PHP',
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS Barcode (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'primary',
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS PosInventory (
    id TEXT PRIMARY KEY,
    productId TEXT UNIQUE NOT NULL,
    allocatedQty REAL DEFAULT 0,
    availableQty REAL DEFAULT 0,
    reservedQty REAL DEFAULT 0,
    soldQty REAL DEFAULT 0,
    damagedQty REAL DEFAULT 0,
    adjustmentQty REAL DEFAULT 0,
    minimumStock REAL DEFAULT 0,
    maximumStock REAL DEFAULT 0,
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (productId) REFERENCES Product(id)
  )`,

  `CREATE TABLE IF NOT EXISTS InventoryLedger (
    id TEXT PRIMARY KEY,
    movementType TEXT NOT NULL,
    referenceNumber TEXT,
    productId TEXT NOT NULL,
    quantity REAL NOT NULL,
    balanceBefore REAL DEFAULT 0,
    balanceAfter REAL DEFAULT 0,
    notes TEXT,
    createdById TEXT,
    createdByName TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (productId) REFERENCES Product(id)
  )`,

  `CREATE TABLE IF NOT EXISTS InventoryTransfer (
    id TEXT PRIMARY KEY,
    transferNumber TEXT UNIQUE NOT NULL,
    sourceWarehouse TEXT,
    destinationPos TEXT,
    status TEXT DEFAULT 'DRAFT',
    createdById TEXT,
    createdByName TEXT,
    approvedById TEXT,
    approvedByName TEXT,
    receivedById TEXT,
    receivedByName TEXT,
    notes TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    approvedAt TEXT,
    receivedAt TEXT,
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS InventoryTransferItem (
    id TEXT PRIMARY KEY,
    transferId TEXT NOT NULL,
    productId TEXT NOT NULL,
    allocatedQty REAL DEFAULT 0,
    receivedQty REAL DEFAULT 0,
    unit TEXT,
    remarks TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (transferId) REFERENCES InventoryTransfer(id) ON DELETE CASCADE,
    FOREIGN KEY (productId) REFERENCES Product(id)
  )`,

  `CREATE TABLE IF NOT EXISTS Sale (
    id TEXT PRIMARY KEY,
    receiptNumber TEXT UNIQUE NOT NULL,
    cashierId TEXT,
    cashierName TEXT,
    customerName TEXT,
    itemCount INTEGER DEFAULT 0,
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total REAL DEFAULT 0,
    paidAmount REAL DEFAULT 0,
    changeAmount REAL DEFAULT 0,
    paymentMethod TEXT DEFAULT 'CASH',
    status TEXT DEFAULT 'COMPLETED',
    businessDate TEXT,
    shiftId TEXT,
    deviceId TEXT,
    branchId INTEGER,
    synced INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS SaleItem (
    id TEXT PRIMARY KEY,
    saleId TEXT NOT NULL,
    productId TEXT,
    productName TEXT,
    sku TEXT,
    barcode TEXT,
    quantity INTEGER DEFAULT 1,
    unitPrice REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    lineTotal REAL DEFAULT 0,
    unit TEXT,
    FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS Payment (
    id TEXT PRIMARY KEY,
    saleId TEXT NOT NULL,
    method TEXT DEFAULT 'CASH',
    amount REAL DEFAULT 0,
    reference TEXT,
    status TEXT DEFAULT 'COMPLETED',
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS Receipt (
    id TEXT PRIMARY KEY,
    saleId TEXT UNIQUE NOT NULL,
    storeName TEXT,
    storeCode TEXT,
    address TEXT,
    phone TEXT,
    footer TEXT,
    printedAt TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS StoreSettings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    storeName TEXT DEFAULT '',
    storeCode TEXT DEFAULT '',
    currencyCode TEXT DEFAULT 'PHP',
    taxLabel TEXT DEFAULT 'VAT',
    taxRate REAL DEFAULT 0,
    supportPhone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    receiptFooter TEXT DEFAULT '',
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS SyncQueue (
    id TEXT PRIMARY KEY,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT,
    status TEXT DEFAULT 'PENDING',
    retryCount INTEGER DEFAULT 0,
    maxRetries INTEGER DEFAULT 5,
    error TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS PaymentMethod (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT,
    type TEXT DEFAULT 'CASH',
    active INTEGER DEFAULT 1,
    sortOrder INTEGER DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS Discount (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT,
    description TEXT,
    type TEXT DEFAULT 'PERCENTAGE',
    value REAL DEFAULT 0,
    minPurchase REAL DEFAULT 0,
    maxUses INTEGER,
    usedCount INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    startsAt TEXT,
    expiresAt TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS StockAlert (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    alertType TEXT NOT NULL,
    currentQty REAL DEFAULT 0,
    thresholdQty REAL DEFAULT 0,
    acknowledged INTEGER DEFAULT 0,
    acknowledgedBy TEXT,
    acknowledgedAt TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (productId) REFERENCES Product(id)
  )`,

  `CREATE TABLE IF NOT EXISTS InventoryAllocation (
    id TEXT PRIMARY KEY,
    productId TEXT,
    allocatedQty REAL DEFAULT 0,
    source TEXT DEFAULT 'oms',
    referenceNumber TEXT,
    notes TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS ProductImage (
    id TEXT PRIMARY KEY,
    fileName TEXT,
    mimeType TEXT DEFAULT 'image/jpeg',
    data BLOB,
    checksum TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`,
];
