// Table definitions, in dependency order (each FK target must already exist).
export const statements = [
  `CREATE TABLE IF NOT EXISTS BUSINESS_TABLE (
    Business_ID INT AUTO_INCREMENT PRIMARY KEY,
    Business_Name VARCHAR(255),
    Business_Photo LONGTEXT
  );`,

  `CREATE TABLE IF NOT EXISTS WORKER_TABLE (
    User_ID INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(255) NOT NULL,
    Business_ID INT,
    Role INT,
    Hashed_Password VARCHAR(255) NOT NULL,
    FOREIGN KEY (Business_ID) REFERENCES BUSINESS_TABLE(Business_ID)
  );`,

  `CREATE TABLE IF NOT EXISTS JOB_TABLE (
    Job_ID VARCHAR(255) PRIMARY KEY,
    Business_ID INT,
    User_ID INT,
    Description VARCHAR(255) NOT NULL,
    Due_Date DATETIME,
    FOREIGN KEY (Business_ID) REFERENCES BUSINESS_TABLE(Business_ID),
    FOREIGN KEY (User_ID) REFERENCES WORKER_TABLE(User_ID)
  );`,

  `CREATE TABLE IF NOT EXISTS JOB_HISTORY (
    History_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT,
    Job_ID VARCHAR(255),
    Business_ID INT,
    Completion_Date DATETIME,
    Description VARCHAR(255),
    Remarks VARCHAR(255),
    FOREIGN KEY (User_ID) REFERENCES WORKER_TABLE(User_ID),
    FOREIGN KEY (Business_ID) REFERENCES BUSINESS_TABLE(Business_ID)
  );`,

  `CREATE TABLE IF NOT EXISTS TOKENS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT,
    Token TEXT,
    Valid TINYINT(1),
    expiries DATETIME,
    FOREIGN KEY (User_ID) REFERENCES WORKER_TABLE(User_ID)
  );`,

  `CREATE TABLE IF NOT EXISTS SUBSCRIPTION_TABLE (
    Subscription_ID INT AUTO_INCREMENT PRIMARY KEY,
    Job_ID VARCHAR(255),
    Business_ID INT,
    Endpoint LONGTEXT NOT NULL,
    Auth_Key1 LONGTEXT NOT NULL,
    Auth_Key2 LONGTEXT NOT NULL,
    Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS NOTIFICATIONS (
    Notification_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT,
    Job_ID VARCHAR(255),
    Notification_Content VARCHAR(255) NOT NULL,
    Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    Is_Read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (User_ID) REFERENCES WORKER_TABLE(User_ID),
    FOREIGN KEY (Job_ID) REFERENCES JOB_TABLE(Job_ID)
  );`,

  // Registration wizard: subdomain reservation + customer-facing business
  // info + ToS acceptance audit trail. Plain MySQL (unlike MariaDB) has no
  // `ADD COLUMN IF NOT EXISTS` syntax at any version, so these are plain
  // ADD COLUMN statements — re-run safety comes from migrations/run.js
  // catching errno 1060 (duplicate column) and skipping, same mechanism
  // used below for the UNIQUE constraints (errno 1061). Subdomain is
  // nullable at the column level (existing businesses have none; MySQL
  // treats multiple NULLs as non-colliding under UNIQUE) — "required" is
  // enforced at the zod layer for new registrations only, no backfill needed.
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN Subdomain VARCHAR(63);`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN Address VARCHAR(500);`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN Location_Link VARCHAR(500);`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN Phone VARCHAR(30);`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN Email VARCHAR(255);`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN Opening_Hours VARCHAR(500);`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN ToS_Accepted TINYINT(1) NOT NULL DEFAULT 0;`,
  `ALTER TABLE BUSINESS_TABLE ADD COLUMN ToS_Accepted_At DATETIME NULL;`,
  // NOTE: before this runs against any DB with existing data, check for
  // duplicate Business_Name rows first — this statement aborts the whole
  // migration run if any exist:
  //   SELECT Business_Name, COUNT(*) FROM BUSINESS_TABLE
  //   GROUP BY Business_Name HAVING COUNT(*) > 1;
  `ALTER TABLE BUSINESS_TABLE ADD CONSTRAINT UQ_Business_Subdomain UNIQUE (Subdomain);`,
  `ALTER TABLE BUSINESS_TABLE ADD CONSTRAINT UQ_Business_Name UNIQUE (Business_Name);`,
];
