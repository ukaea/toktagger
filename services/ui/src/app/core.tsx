"use client";
import type { SortDescriptor } from "@react-types/shared";
import type { Project, Sample } from "@/types";

export let BACKEND_API_URL = "http://localhost:8002";
if (import.meta.env.VITE_DATA_API_URL) {
  BACKEND_API_URL = import.meta.env.VITE_DATA_API_URL;
}

export const getURL = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json();
  return payload;
};

export const getSamples = async (
  sortDescriptor: SortDescriptor,
  project_id: string,
  page: number,
  samplesPerPage: number,
  shotId: string
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
  sample_id: string
): Promise<Sample> => {
  const response = await fetch(
    `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}`
  );
  const data = await response.json();
  const sample = data as Sample;
  return sample;
};

export const getProjects = async (
  sortDescriptor: SortDescriptor,
  page: number,
  projectsPerPage: number,
  name: string
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
    `${BACKEND_API_URL}/projects?${params.toString()}`
  );
  const data = await response.json();
  const projects = data as Project[];
  return projects;
};

export const getProject = async (
  project_id: string
): Promise<Project | null> => {
  const response = await fetch(`${BACKEND_API_URL}/projects/${project_id}`);
  const data = await response.json();
  const project = data as Project;
  return project;
};
