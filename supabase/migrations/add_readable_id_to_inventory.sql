-- Add readable_id serial column to inventory_parts starting from 1000
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS readable_id SERIAL;

-- If readable_id already exists and is not serial or needs to start from 1000, we can reset the sequence.
-- But standard way is to create sequence
CREATE SEQUENCE IF NOT EXISTS inventory_parts_readable_id_seq START 1000;
ALTER TABLE inventory_parts ALTER COLUMN readable_id SET DEFAULT nextval('inventory_parts_readable_id_seq');
ALTER SEQUENCE inventory_parts_readable_id_seq OWNED BY inventory_parts.readable_id;
