INSERT OR IGNORE INTO question_bank_versions SELECT 'v3-before-rollback',payload,revision,datetime('now') FROM question_bank WHERE id=1;
UPDATE question_bank SET payload=(SELECT payload FROM question_bank_versions WHERE version='pre-catalog-v3'),revision=revision+1 WHERE id=1;
