import { TimeSeriesDemo } from "./components/time-series";

export default async function DemoPage() {
  const data = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/data/disruption/13604`)
  const json_data = await data.json()
  return (
    <TimeSeriesDemo data={json_data.ip}/>
  );
}