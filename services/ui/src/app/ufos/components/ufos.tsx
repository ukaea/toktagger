"use client";
import {
  ImageData,
  Annotations,
  DataParams
} from "@/types";
import { Plotly } from "react-plotly.js";
import {Image, SearchField} from '@adobe/react-spectrum'
import { ZoneProvider } from "@/app/components/providers/zone-provider";
import { ContextMenuProvider } from "@/app/components/providers/annotation-provider";
import { TimeSeries } from "@/app/components/plots/time-series";
import { Zones } from "@/app/components/tools/zones";
import "react-contexify/ReactContexify.css";

import {
  createAnnotationToDisplayAnnotationFunc,
  updateAnnotations,
} from "@/app/utils";

import { useEffect, useRef, useState } from "react";

export function FrameSearch({ setDataParams }) {
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onSearchSubmit = async (newValue: string) => {
    if (newValue == "") {
      setErrorMessage("");
    } else if (/^[0-9]*$/.test(newValue)) {
      setErrorMessage("");
      const frame_num = newValue;
      try {
        setDataParams(prev => ({
          ...prev,
          name: "image", 
          frame: Number(frame_num)
        }));
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    } else {
      setErrorMessage("Please enter a number.");
    }
  };

  return (
    <SearchField
      label="Jump to Frame"
      onSubmit={onSearchSubmit}
      validationState={errorMessage ? "invalid" : undefined}
      errorMessage={errorMessage}
    ></SearchField>
  );
}


// This is all chatGPT, dunno if theres an easier way
export default function CanvasImage({ imageData }: { imageData: number[][][] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const height = imageData.length;
    const width = imageData[0].length;

    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.createImageData(width, height);
    let i = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = imageData[y][x];
        imgData.data[i++] = r;
        imgData.data[i++] = g;
        imgData.data[i++] = b;
        imgData.data[i++] = 255; // alpha
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [imageData]);

  return <canvas ref={canvasRef} />;
}


type UFOViewInfo = {
  data: ImageData;
  annotations: Annotations;
  setAnnotations: (
    updater: (annotations: Annotations) => Annotations | Annotations,
  ) => void;
  dataParams: DataParams;
  setDataParams: (
    updater: (dataParams: DataParams) => DataParams | DataParams,
  ) => void;
};

export const UFOView = ({ data, annotations, setAnnotations, dataParams, setDataParams }: UFOViewInfo) => {

  return (
    <div className="flex space-y-3">
      <div className="flex-1 text-center items-center">
        <p> Frame: {data.frame ?? '?'} </p>
        <FrameSearch
          setDataParams={setDataParams}
        />
        <CanvasImage imageData={data.values}>
        </CanvasImage>
      </div>
    </div>
  );
};
