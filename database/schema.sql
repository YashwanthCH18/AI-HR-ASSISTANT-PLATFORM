-- Minimal MySQL schema reconstructed from the router models and voice-service notes.
-- Review before applying to an existing database.
CREATE TABLE IF NOT EXISTS Organizations (
  organization_id VARCHAR(50) PRIMARY KEY,
  org_name VARCHAR(255) NOT NULL,
  subscription_plan VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Users (
  user_id VARCHAR(50) PRIMARY KEY,
  organization_id VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  manager_id VARCHAR(50),
  date_of_joining DATE NOT NULL,
  department VARCHAR(100),
  location VARCHAR(100),
  CONSTRAINT fk_users_organization FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
  CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES Users(user_id)
);

CREATE TABLE IF NOT EXISTS AuthSessions (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  organization_id VARCHAR(50) NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_sessions_token (token),
  INDEX idx_auth_sessions_user (user_id),
  FOREIGN KEY (user_id) REFERENCES Users(user_id),
  FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id)
);

CREATE TABLE IF NOT EXISTS LeaveBalances (
  balance_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  leave_type VARCHAR(50) NOT NULL,
  total_allotted INT NOT NULL,
  leaves_taken INT NOT NULL DEFAULT 0,
  leaves_pending_approval INT NOT NULL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leave_balance (organization_id, user_id, leave_type),
  FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE IF NOT EXISTS LeaveRequests (
  request_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  leave_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested INT NOT NULL,
  reason VARCHAR(1000),
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  decided_by VARCHAR(50) NULL,
  INDEX idx_leave_requests_user (organization_id, user_id, status),
  FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
  FOREIGN KEY (user_id) REFERENCES Users(user_id),
  FOREIGN KEY (decided_by) REFERENCES Users(user_id)
);

CREATE TABLE IF NOT EXISTS CompanyPolicies (
  policy_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id VARCHAR(50) NOT NULL,
  policy_title VARCHAR(255) NOT NULL,
  policy_category VARCHAR(100),
  policy_content TEXT NOT NULL,
  last_reviewed DATE,
  keywords TEXT,
  FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id)
);

CREATE TABLE IF NOT EXISTS PayrollData (
  payroll_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  base_salary DECIMAL(10,2) NOT NULL,
  HRA DECIMAL(10,2),
  conveyance_allowance DECIMAL(10,2),
  medical_allowance DECIMAL(10,2),
  pf_deduction DECIMAL(10,2),
  esi_deduction DECIMAL(10,2),
  professional_tax DECIMAL(10,2),
  ctc DECIMAL(10,2) NOT NULL,
  UNIQUE KEY uq_payroll_user (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
