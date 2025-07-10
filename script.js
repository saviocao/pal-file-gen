
let pyodideReady = loadPyodide();

document.getElementById("process").onclick = async () => {
  const status = document.getElementById("status");
  const zipFile = document.getElementById("zipfile").files[0];
  const outputDiv = document.getElementById("output");
  outputDiv.innerHTML = "";
  status.textContent = "Loading Pyodide...";

  if (!zipFile || !zipFile.name.endsWith(".zip")) {
    status.textContent = "Please upload a .zip file.";
    return;
  }

  const pyodide = await pyodideReady;
  status.textContent = "Preparing filesystem...";

  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`import micropip`);
  await pyodide.runPythonAsync(`await micropip.install('Pillow')`);

  const JSZip = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const zip = await JSZip.default.loadAsync(zipFile);

  await pyodide.FS.mkdir("/input");
  await pyodide.FS.mkdir("/output");

  const promises = Object.keys(zip.files).map(async (filename) => {
    const file = zip.files[filename];
    if (!file.dir) {
      const data = new Uint8Array(await file.async("uint8array"));
      const path = "/input/" + filename;
      const dirs = path.split("/").slice(0, -1);
      let current = "/input";
      for (const d of dirs.slice(1)) {
        current += "/" + d;
        try { pyodide.FS.mkdir(current); } catch {}
      }
      pyodide.FS.writeFile(path, data);
    }
  });
  await Promise.all(promises);

  status.textContent = "Processing...";
  const pyCode = await fetch("processor.py").then(res => res.text());
  pyodide.runPython(pyCode);
  await pyodide.runPythonAsync("run('/input', '/output')");

  const zipOut = new JSZip.default();
  const walk = (dir) => {
    const entries = pyodide.FS.readdir(dir).filter(e => e !== '.' && e !== '..');
    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      if (pyodide.FS.stat(fullPath).isDir()) {
        walk(fullPath);
      } else {
        const data = pyodide.FS.readFile(fullPath);
        zipOut.file(fullPath.replace('/output/', ''), data);
      }
    }
  };
  walk("/output");

  const content = await zipOut.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(content);
  a.download = "processed_output.zip";
  a.textContent = "Download Processed Output";
  outputDiv.appendChild(a);
  status.textContent = "Done!";
};
