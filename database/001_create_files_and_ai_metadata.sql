-- 1. FILES
CREATE TABLE files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    file_name VARCHAR(255),
    file_path TEXT,
    
    -- "Smart Purge" Flag
    -- 'rot' = Redundant, Obsolete, Trivial (Cache, Temp, etc.)
    lifecycle_status VARCHAR(20) DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'archived', 'rot')),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. AI METADATA (The Brain)
CREATE TABLE ai_metadata (
    file_id UUID REFERENCES files(file_id),
    
    -- Vector embedding for "Concept Search"
    content_vector vector(1536),
    
    -- "Shapeshifter" Summary
    summary_text TEXT,
    
    -- "Privacy Redactor" Flags
    contains_pii BOOLEAN DEFAULT FALSE,
    pii_types JSONB -- e.g. ["ssn", "credit_card"]
);
