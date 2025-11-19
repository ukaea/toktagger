"use client";
import type { SortDescriptor } from "@react-types/shared";
import type { Project, Sample, SamplesSummary, Annotation } from "@/types";

export let BACKEND_API_URL = "http://localhost:8002";
if (import.meta.env.VITE_DATA_API_URL) {
  BACKEND_API_URL = import.meta.env.VITE_DATA_API_URL;
}

export const getURL = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json();
  return payload;
};

export async function getSamplesSummary(
  project_id: string,
): Promise<SamplesSummary> {
  const url = `${BACKEND_API_URL}/projects/${project_id}/samples/summary`;
  const response = await fetch(url);
  const data = await response.json();
  const summary = data as SamplesSummary;
  return summary;
}

export const getSamples = async (
  sortDescriptor: SortDescriptor,
  project_id: string,
  page: number,
  samplesPerPage: number,
  shotId: string,
): Promise<Sample[]> => {
  const params = new URLSearchParams();
  params.append("sort_by", sortDescriptor.column.toString());
  params.append("sort_direction", sortDescriptor.direction);
  params.append("start", ((page - 1) * samplesPerPage).toString());
  params.append("count", samplesPerPage.toString());

  if (shotId !== "") {
    params.append("shot_id", shotId);
  }

  const url = `${BACKEND_API_URL}/projects/${project_id}/samples?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();
  const samples = data as Sample[];
  return samples;
};

export const getSample = async (
  project_id: string,
  sample_id: string,
): Promise<Sample> => {
  const response = await fetch(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}`,
  );
  const data = await response.json();
  const sample = data as Sample;
  return sample;
};

export const getProjects = async (
  sortDescriptor: SortDescriptor,
  page: number,
  projectsPerPage: number,
  name: string,
): Promise<Project[]> => {
  const params = new URLSearchParams();
  params.append("sort_by", sortDescriptor.column.toString());
  params.append("sort_direction", sortDescriptor.direction);
  params.append("start", ((page - 1) * projectsPerPage).toString());
  params.append("count", projectsPerPage.toString());
  if (name !== "") {
    params.append("name", name);
  }

  const response = await fetch(
    `${BACKEND_API_URL}/projects?${params.toString()}`,
  );
  const data = await response.json();
  const projects = data as Project[];
  return projects;
};

export const getProject = async (
  project_id: string,
): Promise<Project | null> => {
  const response = await fetch(`${BACKEND_API_URL}/projects/${project_id}`);
  const data = await response.json();
  const project = data as Project;
  return project;
};

export const deleteProject = async (project_id: string) => {
  const response = await fetch(`${BACKEND_API_URL}/projects/${project_id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete project: ${response.statusText}`);
  }
};

export async function getAnnotationsForSample(
  project_id: string,
  sample_id: string,
): Promise<Annotation[]> {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch annotations: ${response.statusText}`);
  }
  const annotations = await response.json();
  return annotations;
}

export async function getAnnotations(
  project_id: string,
): Promise<Annotation[]> {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch annotations: ${response.statusText}`);
  }
  const annotations = await response.json();
  return annotations;
}

export async function saveSampleAnnotations(
  project_id: string,
  sample_id: string,
  annotations: Annotation[],
) {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(annotations),
  });
  if (!response.ok) {
    throw new Error(`Failed to save annotations: ${response.statusText}`);
  }
}

export async function saveAnnotations(
  project_id: string,
  annotations: Annotation[],
) {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(annotations),
  });
  if (!response.ok) {
    throw new Error(`Failed to save annotations: ${response.statusText}`);
  }
}

export function importJSONFile(
  project_id: string,
  file: File,
  callback?: () => void,
): void {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      const annotations = parsed as Annotation[];
      await saveAnnotations(project_id, annotations);
      callback?.();
    } catch {
      throw new Error(`Failed to parse JSON from file: ${file.name}`);
    }
  };
  reader.readAsText(file);
}

export function saveJSONToFile(data: object, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2); // pretty print with 2 spaces
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // Clean up
}

export const exportAnnotations = async (project: Project) => {
  getAnnotations(project._id).then((annotations: Annotation[]) => {
    saveJSONToFile(annotations, `${project.name}_annotations.json`);
  });
};
