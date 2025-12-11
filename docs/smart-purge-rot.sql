-- LOGIC: Identify "Rot" files for the Smart Purge
UPDATE files
SET lifecycle_status = 'rot'
WHERE 
    user_id = :current_user
    AND lifecycle_status = 'active'
    AND (
        -- Rule 1: Known Junk Folders
        file_path ILIKE '%/AppData/Local/Temp/%'
        OR file_path ILIKE '%/.cache/%'
        OR file_path ILIKE '%/node_modules/%'
        
        -- Rule 2: Abandoned "Untitled" Screenshots
        OR (file_name ILIKE 'Screenshot%' AND last_accessed_at < NOW() - INTERVAL '6 months')
        
        -- Rule 3: Ghost Files (0 bytes)
        OR size_bytes = 0
    );
