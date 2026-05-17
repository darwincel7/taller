async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/rpc/fix-purchases-dates", { method: "POST" });
    console.log(await res.json());
  } catch (err) {
    console.error(err);
  }
}
run();
