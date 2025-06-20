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

export const getSample = (project_id: string, sample_id: string) => {
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

export const getProjects = (page, projectsPerPage) => {
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

export const getProject = (project_id: string) => {
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
      const data = await response.json();
      setProject(data);
    };

    fetchData();
  }, []);

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
