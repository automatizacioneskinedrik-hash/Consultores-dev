import test from "node:test";
import assert from "node:assert/strict";
import { cargoOf, legacyRoleFor } from "./roles.js";

test("los usuarios sin cargo lo toman de su rol antiguo", () => {
  assert.equal(cargoOf({ role: "user" }).id, "kadvisor");
  assert.equal(cargoOf({ role: "admin" }).id, "ingeniero");
  assert.equal(cargoOf({ role: "superadmin" }).id, "ingeniero");
  assert.equal(cargoOf({}).id, "kadvisor");
});

test("el cargo guardado manda sobre el rol antiguo, salvo para la cuenta maestra", () => {
  assert.equal(cargoOf({ role: "superadmin", cargo: "waymaker" }).id, "waymaker");
  assert.equal(cargoOf({ cargo: "inventado", role: "user" }).id, "kadvisor");
  assert.equal(cargoOf({ email: "AdminKinedrik@eadic.com", cargo: "kadvisor" }).id, "ingeniero");
});

test("la matriz: los tres primeros ven lo suyo y los demás ven y gestionan todo", () => {
  for (const id of ["atencion_temprana", "waymaker", "kadvisor"]) {
    const cargo = cargoOf({ cargo: id });
    assert.equal(cargo.seesAll, false);
    assert.equal(cargo.manages, false);
  }
  for (const id of ["coordinador_calidad", "supervisor_operacion", "directivo", "ingeniero"]) {
    const cargo = cargoOf({ cargo: id });
    assert.equal(cargo.seesAll, true);
    assert.equal(cargo.manages, true);
  }
});

test("producción sigue recibiendo un rol antiguo coherente con el cargo", () => {
  assert.equal(legacyRoleFor("kadvisor"), "user");
  assert.equal(legacyRoleFor("waymaker"), "user");
  assert.equal(legacyRoleFor("directivo"), "admin");
  assert.equal(legacyRoleFor("ingeniero"), "superadmin");
});

test("la alerta diaria revisa a los cargos que venden; los demás entran si subieron sus propias llamadas", () => {
  for (const id of ["atencion_temprana", "waymaker", "kadvisor"]) assert.equal(cargoOf({ cargo: id }).dailyUploads, true);
  for (const id of ["coordinador_calidad", "supervisor_operacion", "directivo", "ingeniero"]) assert.equal(cargoOf({ cargo: id }).dailyUploads, false);
});
