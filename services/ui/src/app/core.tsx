"use client";
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

export const useGetSamples = (project_id: string, page: number, samplesPerPage: number) => {
  const [samples, setSamples] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/?start=${(page - 1) * samplesPerPage}&count=${samplesPerPage}`);
      const data = await response.json();
      setSamples(data);
    };

    fetchData();
  }, [project_id, page, samplesPerPage]);

  return samples;
} 

export const useGetSample = (project_id: string, sample_id: string) => {
  const [sample, setSample] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`);
      const data = await response.json();
      setSample(data);
    };

    fetchData();
  }, []);

  return sample;
} 

export const useGetProjects = (page: number, projectsPerPage: number) => {
  const [projects, setProjects] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/?start=${(page - 1) * projectsPerPage}&count=${projectsPerPage}`);
      const data = await response.json();
      setProjects(data);
    };

    fetchData();
  }, [page, projectsPerPage]);

  return projects;
} 

export const useGetProject = (project_id: string) => {
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
      const data = await response.json();
      setProject(data);
    };

    fetchData();
  }, [project_id]);

  return project;
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
