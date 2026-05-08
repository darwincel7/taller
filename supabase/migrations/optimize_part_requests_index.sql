-- Optimización para la búsqueda de piezas pendientes
-- Crea un índice GIN en la columna JSONB partRequests para hacer las búsquedas instantáneas
CREATE INDEX IF NOT EXISTS idx_orders_part_requests_gin ON orders USING GIN ("partRequests");
