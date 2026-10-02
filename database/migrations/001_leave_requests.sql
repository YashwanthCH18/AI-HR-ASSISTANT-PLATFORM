-- Apply only after database/check-schema.js confirms this table is absent and
-- after reviewing the existing Railway schema. Do not apply schema.sql to live DB.
CREATE TABLE LeaveRequests (
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
