"use client";
import { Annotations, Data, Project, Sample } from '@/types';
import { useEffect, useState } from 'react';


export const getURL = (url: string) => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(url);
      const payload = await response.json();
      setData(payload);
    };

    fetchData();
  }, []);

  return data;
}

export const getSamples = (project_id: string) => {
  const [samples, setSamples] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples`);
      const data = await response.json();
      setSamples(data);
    };

    fetchData();
  }, []);

  return samples;
} 

export const getProjects = (project_id: string) => {
  const [projects, setProjects] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/`);
      const data = await response.json();
      setProjects(data);
    };

    fetchData();
  }, []);

  return projects;
} 

export const getSampleData = (project_id: string, sample_id: string, viewParams) => {
  const [sampleData, setSampleData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(viewParams),
      });
      const data = await response.json();
      setSampleData(data);
    };

    fetchData();
  }, []);

  return sampleData;
} 

export async function getData(url: string): Promise<Data> {
    const response = await fetch(url);
    const payload = await response.json();
    return payload;
}

export async function getProject(project_id: string):  Promise<Project> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
}

export async function getSample(project_id: string, sample_id: string): Promise<Sample> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`);
}

export async function getSamplesSummary(project_id: string): Promise<Sample[]> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/summary`);
}

export async function getAnnotations(project_id: string, sample_id: string): Promise<Annotations> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`);
}
