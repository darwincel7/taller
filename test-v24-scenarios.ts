import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

try {
  const envConfig = dotenv.parse(fs.readFileSync('.env.example'));
  for (const k in envConfig) {
    if(!process.env[k]) {
        process.env[k] = envConfig[k];
    }
  }
} catch (e) {
  console.log("No .env.example found, using process.env");
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log("--- INICIANDO TESTS V24 POS ---");

  // 1. Venta rápida efectivo
  console.log("1. Venta rapida efectivo...");
  const p1 = await supabase.rpc('pos_checkout_transaction', {
    p_payload: {
      "customer_id": null,
      "raw_customer_id": "CLIENTE-VAR",
      "customer_name": "Test Rapido",
      "seller_id": "test-seller",
      "branch": "Test",
      "total": 100,
      "discount": 0,
      "idempotency_key": "test_rapida_" + Date.now(),
      "items": [{"type": "PRODUCT", "id": "PROD-123", "name": "Venta Rapida", "quantity": 1, "price": 100, "cost": 0}],
      "payments": [{"method": "CASH", "amount": 100}],
      "metadata": {}
    }
  });
  console.log("->", p1.data, p1.error?.message || "");

  // 2. Articulo inventario
  console.log("2. Articulo inventario efectivo (Falla esperada si el id no existe en DB)...");
  const dummyUUID = '00000000-0000-0000-0000-000000000000';
  const p2 = await supabase.rpc('pos_checkout_transaction', {
    p_payload: {
        "idempotency_key": "test_inv_" + Date.now(),
        "total": 50, "discount": 0,
        "items": [{"type": "PRODUCT", "id": dummyUUID, "name": "Cargador", "quantity": 1, "price": 50}],
        "payments": [{"method": "CASH", "amount": 50}]
    }
  });
  console.log("->", p2.data, p2.error?.message || p2.data?.error || "");

  // 3. Pago tarjeta
  console.log("3. Pago Tarjeta...");
  const p3 = await supabase.rpc('pos_checkout_transaction', {
    p_payload: {
        "idempotency_key": "test_tarj_" + Date.now(),
        "total": 20, "discount": 0,
        "items": [{"type": "PRODUCT", "id": "PROD-2", "name": "Cable", "quantity": 1, "price": 20}],
        "payments": [{"method": "CARD", "amount": 20}]
    }
  });
  console.log("->", p3.data);

  // 4. Credito
  console.log("4. Credito...");
  const p4 = await supabase.rpc('pos_checkout_transaction', {
    p_payload: {
        "idempotency_key": "test_cred_" + Date.now(),
        "total": 500, "discount": 0,
        "raw_customer_id": "Cliente Fiao",
        "customer_name": "Juan Fiao",
        "items": [{"type": "PRODUCT", "id": "PROD-3", "name": "Reparacion", "quantity": 1, "price": 500}],
        "payments": [{"method": "CREDIT", "amount": 500}]
    }
  });
  console.log("->", p4.data);

  // 5. Cambiazo
  console.log("5. Cambiazo...");
  const p5 = await supabase.rpc('pos_checkout_transaction', {
    p_payload: {
        "idempotency_key": "test_cambiazo_" + Date.now(),
        "total": 800, "discount": 0,
        "items": [{"type": "PRODUCT", "id": "PROD-PHONE", "name": "Phone", "quantity": 1, "price": 800}],
        "payments": [{"method": "CAMBIAZO", "amount": 800}],
        "received_items": [{
            "name": "iPhone usado",
            "value": 800,
            "details": {"deviceModel": "iPhone usado"}
        }]
    }
  });
  console.log("->", p5.data);

  // 6. Devolucion
  console.log("6. Devolucion...");
  const p6 = await supabase.rpc('pos_checkout_transaction', {
    p_payload: {
        "idempotency_key": "test_dev_" + Date.now(),
        "total": -100, "discount": 0,
        "items": [{"type": "PRODUCT", "id": "PROD-DEV", "name": "Devolucion", "quantity": -1, "price": 100}],
        "payments": [{"method": "CASH", "amount": -100}]
    }
  });
  console.log("->", p6.data);

  console.log("--- TESTS TERMINADOS ---");
}

runTests().catch(console.error);
