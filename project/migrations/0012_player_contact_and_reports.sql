ALTER TABLE questions ADD COLUMN submitter_name TEXT;
ALTER TABLE questions ADD COLUMN submitter_email TEXT;
ALTER TABLE questions ADD COLUMN notification_status TEXT NOT NULL DEFAULT 'not_configured';

ALTER TABLE question_reports RENAME TO question_reports_v1;
CREATE TABLE question_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  reason TEXT NOT NULL CHECK(reason IN ('too_easy_or_obvious','too_hard','multiple_correct_answers','selected_answer_wrong','no_correct_answer','category_mismatch','typo')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','ignored')),
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  notification_status TEXT NOT NULL DEFAULT 'not_configured',
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
INSERT INTO question_reports(id,question_id,reason,status,reporter_name,reporter_email,notification_status,created_at,closed_at)
SELECT id,question_id,
  CASE reason
    WHEN 'answer_error' THEN 'selected_answer_wrong'
    WHEN 'too_easy' THEN 'too_easy_or_obvious'
    WHEN 'too_obvious' THEN 'too_easy_or_obvious'
    WHEN 'too_hard' THEN 'too_hard'
    ELSE 'typo'
  END,
  status,'غير معروف','','not_configured',created_at,closed_at
FROM question_reports_v1;
DROP TABLE question_reports_v1;
CREATE INDEX IF NOT EXISTS question_reports_open ON question_reports(status,question_id);
