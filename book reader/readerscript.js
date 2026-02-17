// === PDF.js Book Viewer ===
const url = "books/book1.pdf"; // Path to your PDF
const pdfjsLib = window["pdfjs-dist/build/pdf"];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

let pdfDoc = null;
let currentPage = 1;
const canvasLeft = document.getElementById("leftPage");
const canvasRight = document.getElementById("rightPage");
const ctxLeft = canvasLeft.getContext("2d");
const ctxRight = canvasRight.getContext("2d");
const pageInfo = document.getElementById("pageInfo");

// Load the PDF
pdfjsLib.getDocument(url).promise.then((pdf) => {
  pdfDoc = pdf;
  renderPages();
});

function renderPage(pageNum, canvas, ctx) {
  return pdfDoc.getPage(pageNum).then((page) => {
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };
    return page.render(renderContext).promise;
  });
}

function renderPages() {
  // quick cross-fade: hide, render, then fade in
  canvasLeft.style.opacity = "0";
  canvasRight.style.opacity = "0";

  const tasks = [renderPage(currentPage, canvasLeft, ctxLeft)];

  let rightRender = Promise.resolve();
  if (currentPage + 1 <= pdfDoc.numPages) {
    rightRender = renderPage(currentPage + 1, canvasRight, ctxRight);
    pageInfo.textContent = `Page ${currentPage}-${currentPage + 1}`;
  } else {
    ctxRight.clearRect(0, 0, canvasRight.width, canvasRight.height);
    pageInfo.textContent = `Page ${currentPage}`;
  }

  tasks.push(rightRender);

  Promise.all(tasks).then(() => {
    requestAnimationFrame(() => {
      canvasLeft.style.opacity = "1";
      canvasRight.style.opacity = "1";
    });
  });
}

document.getElementById("nextPage").addEventListener("click", () => {
  if (currentPage + 2 <= pdfDoc.numPages) {
    currentPage += 2;
    renderPages();
  }
});

document.getElementById("prevPage").addEventListener("click", () => {
  if (currentPage - 2 >= 1) {
    currentPage -= 2;
    renderPages();
  }
});

document.getElementById("rightPage").addEventListener("click", () => {
  if (currentPage + 2 <= pdfDoc.numPages) {
    currentPage += 2;
    renderPages();
  }
});

document.getElementById("leftPage").addEventListener("click", () => {
  if (currentPage - 2 >= 1) {
    currentPage -= 2;
    renderPages();
  }
});
