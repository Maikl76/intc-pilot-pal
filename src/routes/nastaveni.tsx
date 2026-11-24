import {createFileRoute} from "@tanstack/react-router";
import {PilotSettings} from "@/components/PilotSettings";
export const Route=createFileRoute("/nastaveni")({component:PilotSettings,head:()=>({meta:[{title:"Nastavení | INTC Pilot 2.0"}]})});
