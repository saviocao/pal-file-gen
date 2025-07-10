
let pyodideReady = loadPyodide();

document.getElementById("process").onclick = async () => {
  const status = document.getElementById("status");
  const outputDiv = document.getElementById("output");
  outputDiv.innerHTML = "";
  const file = document.getElementById("zipInput").files[0];
  if (!file) return alert("Upload a zip file.");

  status.textContent = "Loading Pyodide...";
  const pyodide = await pyodideReady;

  status.textContent = "Reading ZIP...";
  const JSZip = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const zip = await JSZip.default.loadAsync(file);

  const imageData = {};

  for (const filename of Object.keys(zip.files)) {
    if (!filename.endsWith(".png")) continue;
    const blob = await zip.files[filename].async("blob");
    const name = filename.split("/").pop().replace(/\.png$/, "").replace(/\W+/g, "_");

    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const indexed = [];
    const palette = [];
    const colorMap = {};
    let nextIndex = 0;
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2];
        const key = r + "," + g + "," + b;
        if (!(key in colorMap)) {
          colorMap[key] = nextIndex;
          palette.push([r, g, b]);
          nextIndex++;
        }
        row.push(colorMap[key]);
      }
      indexed.push(row);
    }
    imageData[name] = { pixels: indexed, palette };
  }

  status.textContent = "Running processor...";
  const pyCode = await fetch("processor.py").then(r => r.text());
  pyodide.runPython(pyCode);
  pyodide.globals.set("bundle", imageData);
  pyodide.runPython("run(bundle, '/output')");

  status.textContent = "Rendering previews...";
  const previewJSON = pyodide.FS.readFile("/output/preview.json", { encoding: "utf8" });
  const previews = JSON.parse(previewJSON);
  for (const [filename, b64] of Object.entries(previews)) {
    const img = document.createElement("img");
    img.src = "data:image/png;base64," + b64;
    img.alt = filename;
    img.style.margin = "10px";
    img.style.border = "1px solid #ccc";
    outputDiv.appendChild(img);
  }

  status.textContent = "Zipping results...";
  const zipOut = new JSZip.default();

  function walk(dir) {
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
  }
  walk("/output");

  const zipped = await zipOut.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(zipped);
  a.download = "processed_output.zip";
  a.textContent = "Download Processed Output ZIP";
  outputDiv.appendChild(document.createElement("br"));
  outputDiv.appendChild(a);
  status.textContent = "Done!";
};
