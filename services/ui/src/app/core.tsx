"use client";
import { Annotations, Data, Project, Sample, ViewParams } from "@/types";
import { useEffect, useState } from "react";
import { saveJSONToFile } from "./utils";

export const getURL = (url: string) => {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(url);
      const payload = await response.json();
      setData(payload);
    };

    fetchData();
  }, [url]);

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
  }, [project_id]);

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
  }, [project_id, sample_id]);

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
  }, [project_id]);

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
  }, [project_id, sample_id, viewParams]);

  return sampleData;
} 

export function saveAnnotatorProps<T>(name: string, props: T) {
    sessionStorage.setItem(name, JSON.stringify(props));
}

export function loadAnnotatorProps<T>(name: string): T | null {
    const props = sessionStorage.getItem(name);
    return props ? JSON.parse(props) as T : null;
}

export async function getAnnotationsForSample(project_id: string, sample_id: string): Promise<Annotations> {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch annotations: ${response.statusText}`);
    }
    const annotations = await response.json();
    return annotations;
}

export async function getAnnotations(project_id: string): Promise<Annotations> {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch annotations: ${response.statusText}`);
    }
    const annotations = await response.json();
    return annotations;
}

export async function saveSampleAnnotations(project_id: string, sample_id: string, annotations: Annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotations),
    });
    if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
    }
}


export async function saveAnnotations(project_id: string, annotations: Annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotations),
    });
    if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
    }
}

export function importJSONFile(project_id: string, file: File, callback?: () => void): void  {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const annotations = parsed as Annotations;
        await saveAnnotations(project_id, annotations);
        callback?.();
      } catch (err) {
        throw new Error(`Failed to parse JSON from file: ${file.name}`);
      }
    };
    reader.readAsText(file);
}

export const exportAnnotations = async (project: Project) => {
      getAnnotations(project._id).then((annotations) => {
          saveJSONToFile(annotations, `${project.name}_annotations.json`);
      });
  };