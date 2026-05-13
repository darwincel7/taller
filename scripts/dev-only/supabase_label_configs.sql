-- SQL script to create the label_configs table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.label_configs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    offset_x numeric DEFAULT 0,
    offset_y numeric DEFAULT 0,
    scale numeric DEFAULT 1.0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS idx_label_configs_name ON public.label_configs(name);

-- Enable RLS
ALTER TABLE public.label_configs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all users to read label configs" ON public.label_configs
    FOR SELECT USING (true);

CREATE POLICY "Allow all users to insert label configs" ON public.label_configs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all users to update label configs" ON public.label_configs
    FOR UPDATE USING (true);

CREATE POLICY "Allow all users to delete label configs" ON public.label_configs
    FOR DELETE USING (true);
