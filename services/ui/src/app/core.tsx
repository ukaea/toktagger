"use client";
import { Annotations, Data, Project, Sample, SamplesSummary, ViewParams } from '@/types';
import { useEffect, useState } from 'react';


export async function getData<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const payload = await response.json();
    return payload;
}

export const getProjects = async (): Promise<Project[]> => {
  return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/`);
} 

export async function getProject(project_id: string):  Promise<Project> {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
}

export const getSamples = async (project_id: string): Promise<Sample[]> => {
  return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples`);
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
