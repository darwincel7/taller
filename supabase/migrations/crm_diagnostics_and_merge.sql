-- Diagnostico seguro de duplicados en CRM
CREATE OR REPLACE FUNCTION diagnostic_crm_duplicates()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT json_build_object(
        'by_phone', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT primary_phone, COUNT(*) as qty, array_agg(id) as contact_ids, array_agg(display_name) as names
                FROM crm_contacts
                WHERE primary_phone IS NOT NULL AND primary_phone != ''
                GROUP BY primary_phone
                HAVING COUNT(*) > 1
            ) t
        ),
        'by_display_name', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT display_name, COUNT(*) as qty, array_agg(id) as contact_ids
                FROM crm_contacts
                WHERE display_name IS NOT NULL AND display_name != ''
                GROUP BY display_name
                HAVING COUNT(*) > 1
            ) t
        ),
        'by_external_id', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT channel, external_id, COUNT(*) as qty, array_agg(contact_id) as contact_ids
                FROM crm_contact_identities
                GROUP BY channel, external_id
                HAVING COUNT(*) > 1
            ) t
        ),
        'multiple_conversations_per_contact', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT contact_id, COUNT(*) as qty, array_agg(id) as conversation_ids
                FROM crm_conversations
                WHERE status = 'open'
                GROUP BY contact_id
                HAVING COUNT(*) > 1
            ) t
        )
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Funcion principal de migracion / merge
CREATE OR REPLACE FUNCTION merge_crm_contact_duplicates(dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    result jsonb;
    merged_contacts_count INT := 0;
    merged_conversations_count INT := 0;
    phone_rec RECORD;
    sec_id_rec RECORD;
    conv_rec RECORD;
    sec_conv_rec RECORD;
    master_id UUID;
    master_conv_id UUID;
BEGIN
    -- 1. Unificar contactos por telefono
    FOR phone_rec IN (
        SELECT primary_phone, array_agg(id ORDER BY created_at ASC) as cids
        FROM crm_contacts
        WHERE primary_phone IS NOT NULL AND primary_phone != ''
        GROUP BY primary_phone
        HAVING COUNT(*) > 1
    ) LOOP
        master_id := phone_rec.cids[1]; -- The oldest one is master
        
        FOR i IN 2..array_length(phone_rec.cids, 1) LOOP
            IF NOT dry_run THEN
                UPDATE crm_contact_identities SET contact_id = master_id WHERE contact_id = phone_rec.cids[i];
                UPDATE crm_conversations SET contact_id = master_id WHERE contact_id = phone_rec.cids[i];
                DELETE FROM crm_contacts WHERE id = phone_rec.cids[i];
            END IF;
            merged_contacts_count := merged_contacts_count + 1;
        END LOOP;
    END LOOP;

    -- 2. Unificar identidades por channel + external_id (no deberian haber duplicados en identidades en teoria, pero por si acaso)
    
    -- 3. Unificar conversaciones del mismo contacto
    FOR conv_rec IN (
        SELECT contact_id, array_agg(id ORDER BY last_activity_at DESC NULLS LAST, created_at DESC) as conv_ids
        FROM crm_conversations
        WHERE status = 'open'
        GROUP BY contact_id
        HAVING COUNT(*) > 1
    ) LOOP
        master_conv_id := conv_rec.conv_ids[1]; -- Most recent open conv
        
        FOR i IN 2..array_length(conv_rec.conv_ids, 1) LOOP
            IF NOT dry_run THEN
                UPDATE crm_messages SET conversation_id = master_conv_id WHERE conversation_id = conv_rec.conv_ids[i];
                UPDATE crm_conversations SET status = 'merged', updated_at = now() WHERE id = conv_rec.conv_ids[i];
            END IF;
            merged_conversations_count := merged_conversations_count + 1;
        END LOOP;
    END LOOP;

    result := json_build_object(
        'dry_run', dry_run,
        'contacts_to_merge_or_merged', merged_contacts_count,
        'conversations_to_merge_or_merged', merged_conversations_count,
        'status', CASE WHEN dry_run THEN 'Pending Execution' ELSE 'Merged Successfully' END
    );

    RETURN result;
END;
$$;
