import { useMemo } from 'react';
import { addDays, differenceInDays, parseISO, startOfDay } from 'date-fns';
import { 
  PlanningStage, 
  PlanningTeam, 
  DailyWorkLog,
  GanttTask,
  LineOfBalancePoint,
  ProductivityMetrics
} from '../types';

interface CalculationParams {
  stages: PlanningStage[];
  teams: PlanningTeam[];
  workLogs: DailyWorkLog[];
  totalUnits: number;
  projectStartDate: string;
}

export function usePlanningCalculations({
  stages,
  teams,
  workLogs,
  totalUnits,
  projectStartDate
}: CalculationParams) {
  
  // Calculate planned dates for each stage
  const stageSchedule = useMemo(() => {
    if (!stages.length || !projectStartDate) return [];
    
    const schedule: {
      stageId: string;
      plannedStart: Date;
      plannedEnd: Date;
      actualStart: Date | null;
      actualEnd: Date | null;
      durationDays: number;
    }[] = [];
    
    const startDate = startOfDay(parseISO(projectStartDate));
    let currentDate = startDate;
    
    // Sort by sequence
    const sortedStages = [...stages].sort((a, b) => a.sequence_order - b.sequence_order);
    
    for (const stage of sortedStages) {
      // Duration = total units / (productivity * teams)
      const effectiveProductivity = stage.planned_productivity * stage.planned_teams;
      const durationDays = Math.ceil(totalUnits / effectiveProductivity);
      
      let stageStart = currentDate;
      
      // Check dependency
      if (stage.depends_on) {
        const depSchedule = schedule.find(s => s.stageId === stage.depends_on);
        if (depSchedule) {
          stageStart = addDays(depSchedule.plannedEnd, 1);
        }
      }
      
      const stageEnd = addDays(stageStart, durationDays - 1);
      
      // Find actual dates from work logs
      const stageLogs = workLogs.filter(l => l.stage_id === stage.id);
      const actualStart = stageLogs.length > 0 
        ? parseISO(stageLogs.reduce((min, l) => l.log_date < min ? l.log_date : min, stageLogs[0].log_date))
        : null;
      
      const totalCompleted = stageLogs.reduce((sum, l) => sum + Number(l.units_completed), 0);
      const actualEnd = totalCompleted >= totalUnits && stageLogs.length > 0
        ? parseISO(stageLogs.reduce((max, l) => l.log_date > max ? l.log_date : max, stageLogs[0].log_date))
        : null;
      
      schedule.push({
        stageId: stage.id,
        plannedStart: stageStart,
        plannedEnd: stageEnd,
        actualStart,
        actualEnd,
        durationDays
      });
      
      currentDate = addDays(stageEnd, 1);
    }
    
    return schedule;
  }, [stages, workLogs, totalUnits, projectStartDate]);

  // Generate Gantt tasks
  const ganttTasks = useMemo((): GanttTask[] => {
    return stages.map(stage => {
      const sched = stageSchedule.find(s => s.stageId === stage.id);
      if (!sched) return null;
      
      const stageLogs = workLogs.filter(l => l.stage_id === stage.id);
      const totalCompleted = stageLogs.reduce((sum, l) => sum + Number(l.units_completed), 0);
      const progress = totalUnits > 0 ? (totalCompleted / totalUnits) * 100 : 0;
      
      // Determine status
      let status: GanttTask['status'] = 'planned';
      const today = startOfDay(new Date());
      
      if (progress >= 100) {
        status = 'completed';
      } else if (sched.actualStart) {
        if (today > sched.plannedEnd && progress < 100) {
          status = 'delayed';
        } else if (progress < 50 && differenceInDays(sched.plannedEnd, today) < 3) {
          status = 'at_risk';
        } else {
          status = 'in_progress';
        }
      }
      
      // Find if this is on critical path (simplified: no slack)
      const isCritical = stage.depends_on !== null || 
        stages.some(s => s.depends_on === stage.id);
      
      return {
        id: stage.id,
        name: stage.name,
        start: sched.plannedStart,
        end: sched.plannedEnd,
        progress: Math.min(progress, 100),
        color: stage.color,
        isCritical,
        status,
        dependencies: stage.depends_on ? [stage.depends_on] : []
      };
    }).filter(Boolean) as GanttTask[];
  }, [stages, stageSchedule, workLogs, totalUnits]);

  // Generate Line of Balance data
  const lineOfBalanceData = useMemo((): LineOfBalancePoint[] => {
    const points: LineOfBalancePoint[] = [];
    
    for (const stage of stages) {
      const stageTeams = teams.filter(t => t.stage_id === stage.id && t.is_active);
      const sched = stageSchedule.find(s => s.stageId === stage.id);
      if (!sched) continue;
      
      for (const team of stageTeams) {
        const plannedLine: { x: Date; y: number }[] = [];
        const actualLine: { x: Date; y: number }[] = [];
        
        // Planned line - linear progression
        const unitsPerTeam = Math.ceil(totalUnits / stageTeams.length);
        const daysPerUnit = 1 / stage.planned_productivity;
        
        for (let unit = 0; unit <= unitsPerTeam; unit++) {
          const day = Math.floor(unit * daysPerUnit);
          plannedLine.push({
            x: addDays(sched.plannedStart, day),
            y: unit
          });
        }
        
        // Actual line from work logs
        const teamLogs = workLogs
          .filter(l => l.stage_id === stage.id && l.team_id === team.id)
          .sort((a, b) => a.log_date.localeCompare(b.log_date));
        
        let cumulativeUnits = 0;
        for (const log of teamLogs) {
          cumulativeUnits += Number(log.units_completed);
          actualLine.push({
            x: parseISO(log.log_date),
            y: cumulativeUnits
          });
        }
        
        points.push({
          stageId: stage.id,
          stageName: stage.name,
          teamId: team.id,
          teamName: team.name,
          color: stage.color,
          plannedLine,
          actualLine
        });
      }
    }
    
    return points;
  }, [stages, teams, stageSchedule, workLogs, totalUnits]);

  // Calculate productivity metrics
  const productivityMetrics = useMemo((): ProductivityMetrics[] => {
    return stages.map(stage => {
      const stageLogs = workLogs.filter(l => l.stage_id === stage.id);
      
      if (stageLogs.length === 0) {
        return {
          stageId: stage.id,
          stageName: stage.name,
          plannedProductivity: stage.planned_productivity,
          actualProductivity: 0,
          variance: 0,
          variancePercent: 0
        };
      }
      
      // Calculate actual productivity (units per day)
      const totalUnitsCompleted = stageLogs.reduce((sum, l) => sum + Number(l.units_completed), 0);
      const uniqueDays = new Set(stageLogs.map(l => l.log_date)).size;
      const stageTeams = teams.filter(t => t.stage_id === stage.id && t.is_active);
      
      const actualProductivity = uniqueDays > 0 
        ? totalUnitsCompleted / (uniqueDays * stageTeams.length)
        : 0;
      
      const variance = actualProductivity - stage.planned_productivity;
      const variancePercent = stage.planned_productivity > 0
        ? (variance / stage.planned_productivity) * 100
        : 0;
      
      return {
        stageId: stage.id,
        stageName: stage.name,
        plannedProductivity: stage.planned_productivity,
        actualProductivity,
        variance,
        variancePercent
      };
    });
  }, [stages, teams, workLogs]);

  // Calculate projected end date
  const projectedEndDate = useMemo(() => {
    if (stageSchedule.length === 0) return null;
    
    // Find the latest end date considering actual progress
    let latestDate = stageSchedule[stageSchedule.length - 1]?.plannedEnd;
    
    // Adjust based on actual productivity variance
    for (const metric of productivityMetrics) {
      if (metric.actualProductivity > 0 && metric.variancePercent < -10) {
        // If significantly behind, extend projection
        const stage = stages.find(s => s.id === metric.stageId);
        if (stage) {
          const delayFactor = 1 - (metric.variancePercent / 100);
          const originalDuration = stageSchedule.find(s => s.stageId === stage.id)?.durationDays || 0;
          const additionalDays = Math.ceil(originalDuration * (delayFactor - 1));
          latestDate = addDays(latestDate, additionalDays);
        }
      }
    }
    
    return latestDate;
  }, [stageSchedule, productivityMetrics, stages]);

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (stages.length === 0) return 0;
    
    const stageProgresses = stages.map(stage => {
      const stageLogs = workLogs.filter(l => l.stage_id === stage.id);
      const totalCompleted = stageLogs.reduce((sum, l) => sum + Number(l.units_completed), 0);
      return totalUnits > 0 ? (totalCompleted / totalUnits) * 100 : 0;
    });
    
    return stageProgresses.reduce((sum, p) => sum + p, 0) / stages.length;
  }, [stages, workLogs, totalUnits]);

  return {
    stageSchedule,
    ganttTasks,
    lineOfBalanceData,
    productivityMetrics,
    projectedEndDate,
    overallProgress
  };
}
