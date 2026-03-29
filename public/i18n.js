window.tzT = function (key, fallback, vars) {
  var bag = window.__TZM_I18N__;
  var s = bag && bag[key] !== undefined && bag[key] !== "" ? bag[key] : fallback;
  if (vars && typeof s === "string") {
    Object.keys(vars).forEach(function (k) {
      s = s.split("{" + k + "}").join(String(vars[k]));
    });
  }
  return s;
};
