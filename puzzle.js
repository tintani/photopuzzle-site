(function (root) {
  "use strict";

  const GRID_SIZE = 6;
  const PIECE_COUNT = GRID_SIZE * GRID_SIZE;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 40_000_000;
  const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const EFFECT_DURATION_MS = 1350;
  const MIN_TOUCH_TILE = 44;

  function shufflePositions(random = Math.random) {
    const positions = Array.from({ length: PIECE_COUNT }, (_, index) => index);
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(random() * (index + 1));
      [positions[index], positions[otherIndex]] = [positions[otherIndex], positions[index]];
    }
    if (positions.every((piece, index) => piece === index)) {
      [positions[0], positions[1]] = [positions[1], positions[0]];
    }
    return positions;
  }

  function getPuzzleGeometry(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error("画像のサイズを読み取れませんでした。");
    }
    return { width, height, aspectRatio: width / height, columns: GRID_SIZE, rows: GRID_SIZE };
  }

  function getResponsiveBoardWidth(viewportWidth, imageWidth, imageHeight) {
    if (!Number.isFinite(viewportWidth) || viewportWidth < 1) {
      throw new Error("盤面の表示幅を取得できませんでした。");
    }
    const { aspectRatio } = getPuzzleGeometry(imageWidth, imageHeight);
    return Math.ceil(Math.max(viewportWidth, GRID_SIZE * MIN_TOUCH_TILE * Math.max(1, aspectRatio)));
  }

  function getPieceSourceRect(width, height, position) {
    if (!Number.isInteger(position) || position < 0 || position >= PIECE_COUNT) {
      throw new Error("ピースの位置が正しくありません。");
    }
    const geometry = getPuzzleGeometry(width, height);
    const column = position % GRID_SIZE;
    const row = Math.floor(position / GRID_SIZE);
    return {
      x: column * geometry.width / GRID_SIZE,
      y: row * geometry.height / GRID_SIZE,
      width: geometry.width / GRID_SIZE,
      height: geometry.height / GRID_SIZE,
    };
  }

  function createPuzzleApp(options = {}) {
    const doc = options.document || root.document;
    const urlApi = options.URL || root.URL;
    const random = options.random || Math.random;
    const schedule = options.setTimeout || root.setTimeout.bind(root);
    const elements = {
      file: doc.querySelector("#photoFile"),
      choose: doc.querySelector("#choosePhoto"),
      previewFrame: doc.querySelector("#photoPreview"),
      preview: doc.querySelector("#previewImage"),
      photoStatus: doc.querySelector("#photoStatus"),
      create: doc.querySelector("#createPuzzle"),
      section: doc.querySelector("#puzzleSection"),
      boardScroller: doc.querySelector("#boardScroller"),
      boardScrollHint: doc.querySelector("#boardScrollHint"),
      title: doc.querySelector("#puzzleTitle"),
      boardWrap: doc.querySelector("#boardWrap"),
      board: doc.querySelector("#board"),
      particles: doc.querySelector("#celebrationParticles"),
      gameStatus: doc.querySelector("#gameStatus"),
      restart: doc.querySelector("#restart"),
    };

    let previewUrl = null;
    let puzzleUrl = null;
    let selectedMime = null;
    let imageWidth = 0;
    let imageHeight = 0;
    let selectionVersion = 0;
    let effectVersion = 0;
    let positions = [];
    let selectedPosition = null;
    let isComplete = false;
    let celebrationPlayed = false;

    function releaseUrl(url) {
      if (url) urlApi.revokeObjectURL(url);
    }

    function setPhotoStatus(message, isError = false) {
      elements.photoStatus.textContent = message;
      elements.photoStatus.classList.toggle("is-error", isError);
    }

    function setGameStatus(message, state = "normal") {
      elements.gameStatus.textContent = message;
      elements.gameStatus.classList.toggle("is-complete", state === "complete");
      elements.gameStatus.classList.toggle("is-error", state === "error");
    }

    function resetCelebration() {
      effectVersion += 1;
      celebrationPlayed = false;
      elements.board.classList.remove("is-celebrating", "is-complete");
      elements.boardWrap.classList.remove("is-celebrating");
      elements.gameStatus.classList.remove("is-complete");
      elements.particles.replaceChildren();
    }

    function clearPuzzle() {
      resetCelebration();
      puzzleUrl = null;
      positions = [];
      selectedPosition = null;
      isComplete = false;
      imageWidth = 0;
      imageHeight = 0;
      elements.board.replaceChildren();
      elements.board.style.aspectRatio = "";
      elements.boardWrap.style.width = "";
      elements.boardScrollHint.hidden = true;
      elements.section.hidden = true;
      elements.title.textContent = "あなたの写真";
      elements.create.disabled = !selectedMime;
      elements.restart.disabled = false;
      setGameStatus("");
    }

    function updateBoardLayout() {
      if (!imageWidth || !imageHeight) return;
      const availableWidth = elements.boardScroller.clientWidth || elements.boardScroller.getBoundingClientRect().width;
      if (!availableWidth) return;
      const displayWidth = getResponsiveBoardWidth(availableWidth, imageWidth, imageHeight);
      elements.boardWrap.style.width = `${displayWidth}px`;
      elements.board.style.aspectRatio = `${imageWidth} / ${imageHeight}`;
      elements.boardScrollHint.hidden = displayWidth <= availableWidth + 0.5;
    }

    function clearSelectedPhoto() {
      selectedMime = null;
      elements.create.disabled = true;
      elements.preview.removeAttribute("src");
      elements.preview.alt = "選択した写真のプレビュー";
      elements.previewFrame.hidden = true;
      releaseUrl(previewUrl);
      previewUrl = null;
    }

    function clearForNewSelection() {
      clearPuzzle();
      clearSelectedPhoto();
    }

    function playCelebration() {
      if (celebrationPlayed) return;
      celebrationPlayed = true;
      const currentEffect = ++effectVersion;
      elements.board.classList.add("is-celebrating");
      elements.boardWrap.classList.add("is-celebrating");
      elements.particles.replaceChildren();

      const particleCount = 24;
      for (let index = 0; index < particleCount; index += 1) {
        const particle = doc.createElement("span");
        const angle = (Math.PI * 2 * index) / particleCount + (random() - 0.5) * 0.18;
        const distance = 42 + random() * 88;
        particle.className = `particle particle-${index % 4}`;
        particle.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
        particle.style.setProperty("--delay", `${Math.floor(random() * 110)}ms`);
        particle.style.setProperty("--hue", `${35 + Math.floor(random() * 150)}`);
        elements.particles.append(particle);
      }

      schedule(() => {
        if (currentEffect !== effectVersion) return;
        elements.board.classList.remove("is-celebrating");
        elements.boardWrap.classList.remove("is-celebrating");
        elements.particles.replaceChildren();
      }, EFFECT_DURATION_MS);
    }

    function renderBoard() {
      elements.board.replaceChildren();
      positions.forEach((piece, position) => {
        const tile = doc.createElement("button");
        const row = Math.floor(piece / GRID_SIZE);
        const column = piece % GRID_SIZE;
        tile.type = "button";
        tile.className = "tile";
        tile.setAttribute("aria-label", `位置${position + 1}のピース`);
        tile.setAttribute("aria-pressed", String(selectedPosition === position));
        tile.style.backgroundImage = `url("${puzzleUrl}")`;
        tile.style.backgroundPosition = `${column * 20}% ${row * 20}%`;
        if (selectedPosition === position) tile.classList.add("is-selected");
        tile.disabled = isComplete;
        tile.addEventListener("click", () => selectTile(position));
        elements.board.append(tile);
      });
      elements.board.classList.toggle("is-complete", isComplete);

      if (isComplete) {
        setGameStatus("完成！写真の景色がつながりました。", "complete");
      } else if (selectedPosition === null) {
        setGameStatus("ピースを2つ選んで交換してください。");
      } else {
        setGameStatus("交換するピースをもう1つ選んでください。");
      }
    }

    function selectTile(position) {
      if (isComplete) return;
      if (selectedPosition === null) {
        selectedPosition = position;
      } else if (selectedPosition === position) {
        selectedPosition = null;
      } else {
        [positions[selectedPosition], positions[position]] = [positions[position], positions[selectedPosition]];
        selectedPosition = null;
        isComplete = positions.every((piece, index) => piece === index);
      }
      renderBoard();
      if (isComplete) playCelebration();
    }

    async function handleFileChange() {
      const file = elements.file.files && elements.file.files[0];
      elements.file.value = "";
      if (!file) return;

      const currentVersion = ++selectionVersion;
      clearForNewSelection();
      setPhotoStatus("写真を読み込み中…");

      const mimeType = String(file.type || "").toLowerCase();
      if (!SUPPORTED_TYPES.has(mimeType)) {
        setPhotoStatus("JPEG、PNG、WebP形式の画像を選択してください。", true);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setPhotoStatus("写真のサイズは10MB以下にしてください。", true);
        return;
      }

      let candidateUrl = null;
      try {
        candidateUrl = urlApi.createObjectURL(file);
        previewUrl = candidateUrl;
        elements.previewFrame.hidden = false;
        elements.preview.src = candidateUrl;
        await elements.preview.decode();
        if (currentVersion !== selectionVersion) return;

        const { naturalWidth: width, naturalHeight: height } = elements.preview;
        if (!width || !height) throw new Error("画像のサイズを読み取れませんでした。");
        if (width * height > MAX_IMAGE_PIXELS) {
          throw new Error("画像の解像度が大きすぎます。サイズを小さくした写真を選んでください。");
        }

        selectedMime = mimeType;
        imageWidth = width;
        imageHeight = height;
        elements.create.disabled = false;
        setPhotoStatus("写真を読み込みました。この写真でパズルを作れます。");
      } catch (error) {
        if (currentVersion !== selectionVersion) {
          if (candidateUrl && candidateUrl !== previewUrl) releaseUrl(candidateUrl);
          return;
        }
        clearSelectedPhoto();
        setPhotoStatus(error && error.message === "画像の解像度が大きすぎます。サイズを小さくした写真を選んでください。"
          ? error.message
          : "画像を読み込めませんでした。別の写真を選んでください。", true);
      }
    }

    function makePuzzle() {
      if (!selectedMime || !previewUrl || !imageWidth || !imageHeight) {
        setPhotoStatus("先に写真を選択してください。", true);
        return;
      }
      try {
        const geometry = getPuzzleGeometry(imageWidth, imageHeight);
        puzzleUrl = previewUrl;
        positions = shufflePositions(random);
        selectedPosition = null;
        isComplete = false;
        resetCelebration();
        elements.title.textContent = "あなたの写真";
        elements.section.hidden = false;
        updateBoardLayout();
        elements.create.disabled = true;
        renderBoard();
        setPhotoStatus("パズルを作成しました。写真はこのブラウザ内で処理されています。");
      } catch {
        clearPuzzle();
        elements.create.disabled = false;
        setPhotoStatus("パズルを作成できませんでした。写真を選び直すか、もう一度お試しください。", true);
      }
    }

    function restartPuzzle() {
      try {
        if (!puzzleUrl) throw new Error("パズルを作成してからシャッフルしてください。");
        resetCelebration();
        positions = shufflePositions(random);
        selectedPosition = null;
        isComplete = false;
        renderBoard();
      } catch {
        setGameStatus("リセットできませんでした。もう一度お試しください。", "error");
      }
    }

    const view = options.window || root;
    view.addEventListener?.("resize", updateBoardLayout);

    elements.choose.addEventListener("click", () => elements.file.click());
    elements.file.addEventListener("change", handleFileChange);
    elements.create.addEventListener("click", makePuzzle);
    elements.restart.addEventListener("click", restartPuzzle);

    return { handleFileChange, makePuzzle, restartPuzzle, updateBoardLayout };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createPuzzleApp, getPuzzleGeometry, getPieceSourceRect, getResponsiveBoardWidth, shufflePositions };
  }
  if (root.document) createPuzzleApp();
})(globalThis);
