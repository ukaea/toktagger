"use client";
import { useEffect, useState } from 'react';
import type { SortDescriptor } from '@react-types/shared';
import type { Project, Sample } from '@/types';

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

export const getSamples = (sortDescriptor: SortDescriptor<Sample>, project_id: string, page: number, samplesPerPage: number, shotId: string): Sample[] | null => {
  const [samples, setSamples] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const params = new URLSearchParams();
      params.append('sort_by', sortDescriptor.column);
      params.append('sort_direction', sortDescriptor.direction);
      params.append('start', ((page - 1) * samplesPerPage).toString());
      params.append('count', samplesPerPage.toString());
      if (shotId !== ""){
        params.append('shot_id', shotId);
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/?${params.toString()}`);
      const data = await response.json();
      setSamples(data);
    };

    fetchData();
  }, [sortDescriptor, project_id, page, samplesPerPage, shotId]);

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

export const getProjects = (sortDescriptor: SortDescriptor<Project>, page: number, projectsPerPage: number, name: string): Project[] | null => {
  const [projects, setProjects] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const params = new URLSearchParams();
      params.append('sort_by', sortDescriptor.column);
      params.append('sort_direction', sortDescriptor.direction);
      params.append('start', ((page - 1) * projectsPerPage).toString());
      params.append('count', projectsPerPage.toString());
      if (name !== ""){
        params.append('name', name);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/?${params.toString()}`);
      const data = await response.json();
      setProjects(data);
    };

    fetchData();
  }, [sortDescriptor, page, projectsPerPage, name]);

  return projects;
} 

export const getProject = (project_id: string): Project | null => {
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
