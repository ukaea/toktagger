"use client";
import {
  ImageData,
  DataParams
} from "@/types";
import {SearchField} from '@adobe/react-spectrum'
import "react-contexify/ReactContexify.css";

import { useState } from "react";

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

export default function ImageDisplay({ imageData }: { imageData: string }) {
  return (
    <img
      src={`data:image/png;base64,${imageData}`}
      alt="generated"
      style={{ imageRendering: "pixelated" }}
    />
  );
}


type UFOViewInfo = {
  data: ImageData;
  setDataParams: (
    updater: (dataParams: DataParams) => DataParams | DataParams,
  ) => void;
};

export const UFOView = ({ data, setDataParams }: UFOViewInfo) => {

  return (
    <div className="flex space-y-3">
      <div className="flex-1 text-center items-center">
        <p> Frame: {data.frame ?? '?'} </p>
        <FrameSearch
          setDataParams={setDataParams}
        />
        <ImageDisplay imageData={data.values}>
        </ImageDisplay>
      </div>
    </div>
  );
};
