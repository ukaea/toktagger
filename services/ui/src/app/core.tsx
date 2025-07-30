"use client";
import { Data, Project, Sample, ViewParams } from "@/types";
import { useEffect, useState } from "react";

export const getURL = (url: string) => {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(url);
      const payload = await response.json();
      setData(payload);
    };

    fetchData();
  }, []);

  return data;
};

export const getSamples = (project_id: string): Sample[] | null => {
  const [samples, setSamples] = useState<Sample[] | null>([]);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples`
      );
      const data = await response.json();
      setSamples(data);
    };

    fetchData();
  }, []);

  return samples;
};

export const getSample = (
  project_id: string,
  sample_id: string
): Sample | null => {
  const [sample, setSample] = useState<Sample | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`
      );
      const data = await response.json();
      setSample(data);
    };

    fetchData();
  }, []);

  return sample;
};

export const getProjects = (): Project[] | null => {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/`
      );
      const data = await response.json();
      setProjects(data);
    };

    fetchData();
  }, []);

  return projects;
};

export const getProject = (project_id: string): Project | null => {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`
      );
      const data = await response.json();
      setProject(data);
    };

    fetchData();
  }, []);

  return project;
};

export const getSampleData = (
  project_id: string,
  sample_id: string,
  viewParams: ViewParams
): Sample | null => {
  const [sampleData, setSampleData] = useState<Sample | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(viewParams),
        }
      );
      const data = await response.json();
      setSampleData(data);
    };

    fetchData();
  }, []);

  return sampleData;
};
