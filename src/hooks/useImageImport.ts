import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, fileToBase64 } from "../lib/api";
import {
  DEFAULT_IMPORT_DRAFT,
  importDraftReducer,
} from "../lib/importDraft";
import { isImageFileName, resolveThemeName, themeNameFromImage } from "../lib/themeName";
import { withTimeout } from "../lib/withTimeout";
import type { SelectedImage } from "../components/ImportPanel";

const PREVIEW_TIMEOUT_MS = 6000;

export function useImageImport(options: {
  installed: boolean;
  showToast: (message: string, kind?: "ok" | "err") => void;
}) {
  const { installed, showToast } = options;
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [draft, dispatchDraft] = useReducer(importDraftReducer, DEFAULT_IMPORT_DRAFT);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLLabelElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const formFields = useMemo(() => {
    const {
      themeName,
      appearance,
      safeArea,
      taskMode,
      homeLayout,
      surfaceStyle,
      cardSize,
      useCustomFocus,
      focusX,
      focusY,
      heroTitle,
      heroSubtitle,
      projectLabel,
      statusText,
      accentColor,
      useCustomAccent,
    } = draft;
    return {
      name: resolveThemeName(themeName, selectedImage?.name),
      appearance,
      safeArea,
      taskMode,
      homeLayout,
      focusX: useCustomFocus ? focusX / 100 : undefined,
      focusY: useCustomFocus ? focusY / 100 : undefined,
      surfaceStyle,
      cardSize,
      heroTitle: heroTitle.trim(),
      heroSubtitle: heroSubtitle.trim(),
      projectLabel: projectLabel.trim(),
      statusText: statusText.trim(),
      accentColor: useCustomAccent ? accentColor : undefined,
      saveLibrary: true,
    };
  }, [draft, selectedImage]);

  const acceptSelectedImage = useCallback(
    (next: SelectedImage | null) => {
      if (!next) {
        setSelectedImage(null);
        return;
      }
      if (!isImageFileName(next.name)) {
        showToast("请拖入图片文件（png/jpg/webp/heic/tiff）", "err");
        return;
      }
      setSelectedImage(next);
      if (!draft.themeName.trim()) {
        dispatchDraft({ type: "setThemeName", value: themeNameFromImage(next.name) });
      }
    },
    [draft.themeName, showToast],
  );

  const importSelectedImage = useCallback(
    async (importOptions?: { applyNow?: boolean }) => {
      if (!selectedImage) {
        throw new Error("请先选择一张图片");
      }
      const current = selectedImage;
      const applyNow = importOptions?.applyNow ?? true;
      const base = {
        ...formFields,
        saveLibrary: true,
        applyNow,
      };
      const result =
        current.source === "path"
          ? await api.importTheme({
              ...base,
              path: current.path,
            })
          : await api.importTheme({
              ...base,
              fileBase64: await fileToBase64(current.file),
              fileName: current.file.name,
            });
      if (result.ok) {
        setSelectedImage(null);
        dispatchDraft({ type: "resetThemeName" });
      }
      return result;
    },
    [formFields, selectedImage],
  );

  useEffect(() => {
    let cancelled = false;
    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    if (!selectedImage) {
      revokeObjectUrl();
      setPreviewUrl(null);
      return;
    }

    if (selectedImage.source === "file") {
      revokeObjectUrl();
      const url = URL.createObjectURL(selectedImage.file);
      objectUrlRef.current = url;
      setPreviewUrl(url);
      return () => {
        cancelled = true;
        revokeObjectUrl();
      };
    }

    setPreviewUrl(null);
    void withTimeout(api.previewImage(selectedImage.path), PREVIEW_TIMEOUT_MS)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const pointInDropzone = useCallback((clientX: number, clientY: number) => {
    const el = dropzoneRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const pad = 24;
    return (
      clientX >= rect.left - pad &&
      clientX <= rect.right + pad &&
      clientY >= rect.top - pad &&
      clientY <= rect.bottom + pad
    );
  }, []);

  return {
    selectedImage,
    setSelectedImage,
    draft,
    dispatchDraft,
    dragOver,
    setDragOver,
    previewUrl,
    dropzoneRef,
    acceptSelectedImage,
    importSelectedImage,
    pointInDropzone,
    installed,
  };
}
