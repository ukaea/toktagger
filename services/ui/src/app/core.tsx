"use client";
import { Annotations, Project, Sample, SamplesSummary } from '@/types';
import { SortDescriptor } from '@react-types/shared';

export async function getData<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const payload = await response.json();
    return payload;
}

export const getProjects = async (sortDescriptor: SortDescriptor, page: number, projectsPerPage: number, name: string): Promise<Project[]> => {
  const params = new URLSearchParams();
  params.append('sort_by', sortDescriptor.column.toString());
  params.append('sort_direction', sortDescriptor.direction);
  params.append('start', ((page - 1) * projectsPerPage).toString());
  params.append('count', projectsPerPage.toString());
  if (name !== ""){
    params.append('name', name);
  }
  return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects?${params.toString()}`);
} 

export async function getProject(project_id: string):  Promise<Project> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
}

export const getSamples = async ( project_id: string, sortDescriptor: SortDescriptor, page: number, samplesPerPage: number, shotId: string): Promise<Sample[]> => {
  const params = new URLSearchParams();
  params.append('sort_by', sortDescriptor.column.toString());
  params.append('sort_direction', sortDescriptor.direction);
  params.append('start', ((page - 1) * samplesPerPage).toString());
  params.append('count', samplesPerPage.toString());

  if (shotId !== ""){
    params.append('shot_id', shotId);
  }

  return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples?${params.toString()}`);
} 


export async function getSample(project_id: string, sample_id: string): Promise<Sample> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`);
}

export async function getSamplesSummary(project_id: string): Promise<SamplesSummary> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/summary`);
}

export async function getAnnotations(project_id: string, sample_id: string): Promise<Annotations> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`);
}

export const deleteProject = async (project_id: string) => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete project: ${response.statusText}`);
  }
};
