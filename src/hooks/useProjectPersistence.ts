import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { House, Macro, Quadra, MACROS_TEMPLATE } from "@/data/constructionData";
import { Project } from "@/contexts/ConstructionContext";
import { Json } from "@/integrations/supabase/types";

// Helper to convert Macro[] to Json
const macrosToJson = (macros: Macro[]): Json => {
  return macros as unknown as Json;
};

// Helper to convert Json to Macro[]
const jsonToMacros = (json: Json): Macro[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as Macro[];
};

export function useProjectPersistence() {
  // Load all projects from database
  const loadProjects = useCallback(async (): Promise<Project[]> => {
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (projectsError) {
      console.error('Error loading projects:', projectsError);
      return [];
    }

    const projects: Project[] = [];

    for (const p of projectsData || []) {
      // Load quadras for this project
      const { data: quadrasData } = await supabase
        .from('quadras')
        .select('*')
        .eq('project_id', p.id);

      // Load houses for this project
      const { data: housesData } = await supabase
        .from('houses')
        .select('*')
        .eq('project_id', p.id)
        .order('house_number', { ascending: true });

      const quadras: Quadra[] = (quadrasData || []).map(q => ({
        id: q.id,
        name: q.name,
        houses: q.house_ids || [],
      }));

      const houses: House[] = (housesData || []).map(h => ({
        id: h.house_number,
        quadra: h.quadra_id || "",
        area: h.area,
        type: h.type,
        constructorName: h.constructor_name || "",
        expectedDate: h.expected_date || "",
        lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
        macros: jsonToMacros(h.macros),
      }));

      projects.push({
        id: p.id,
        name: p.name,
        location: p.location,
        contractor: p.contractor,
        startDate: p.start_date,
        expectedEndDate: p.expected_end_date,
        totalHouses: p.total_houses,
        unitSize: p.unit_size,
        projectType: p.project_type,
        houses,
        quadras,
        macrosTemplate: jsonToMacros(p.macros_template),
        createdAt: p.created_at,
        setupComplete: p.setup_complete,
      });
    }

    return projects;
  }, []);

  // Save a new project
  const saveProject = useCallback(async (project: Project): Promise<string | null> => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        id: project.id,
        name: project.name,
        location: project.location,
        contractor: project.contractor,
        start_date: project.startDate,
        expected_end_date: project.expectedEndDate,
        total_houses: project.totalHouses,
        unit_size: project.unitSize,
        project_type: project.projectType,
        macros_template: macrosToJson(project.macrosTemplate),
        setup_complete: project.setupComplete,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving project:', error);
      return null;
    }

    // Save houses
    if (project.houses.length > 0) {
      const housesInsert = project.houses.map(h => ({
        project_id: data.id,
        house_number: h.id,
        quadra_id: h.quadra || null,
        area: h.area,
        type: h.type,
        constructor_name: h.constructorName,
        expected_date: h.expectedDate || null,
        macros: macrosToJson(h.macros),
      }));

      const { error: housesError } = await supabase
        .from('houses')
        .insert(housesInsert);

      if (housesError) {
        console.error('Error saving houses:', housesError);
      }
    }

    return data.id;
  }, []);

  // Update an existing project
  const updateProjectInDb = useCallback(async (project: Project): Promise<boolean> => {
    const { error } = await supabase
      .from('projects')
      .update({
        name: project.name,
        location: project.location,
        contractor: project.contractor,
        start_date: project.startDate,
        expected_end_date: project.expectedEndDate,
        total_houses: project.totalHouses,
        unit_size: project.unitSize,
        project_type: project.projectType,
        macros_template: macrosToJson(project.macrosTemplate),
        setup_complete: project.setupComplete,
      })
      .eq('id', project.id);

    if (error) {
      console.error('Error updating project:', error);
      return false;
    }

    return true;
  }, []);

  // Delete a project
  const deleteProjectFromDb = useCallback(async (projectId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return false;
    }

    return true;
  }, []);

  // Save/update a house
  const saveHouse = useCallback(async (projectId: string, house: House): Promise<boolean> => {
    const { error } = await supabase
      .from('houses')
      .upsert({
        project_id: projectId,
        house_number: house.id,
        quadra_id: house.quadra || null,
        area: house.area,
        type: house.type,
        constructor_name: house.constructorName,
        expected_date: house.expectedDate || null,
        macros: macrosToJson(house.macros),
        last_update: new Date().toISOString().split('T')[0],
      }, {
        onConflict: 'project_id,house_number',
      });

    if (error) {
      console.error('Error saving house:', error);
      return false;
    }

    return true;
  }, []);

  // Save multiple houses
  const saveHouses = useCallback(async (projectId: string, houses: House[]): Promise<boolean> => {
    if (houses.length === 0) return true;

    // First delete existing houses for this project
    await supabase
      .from('houses')
      .delete()
      .eq('project_id', projectId);

    // Then insert all houses
    const housesInsert = houses.map(h => ({
      project_id: projectId,
      house_number: h.id,
      quadra_id: h.quadra || null,
      area: h.area,
      type: h.type,
      constructor_name: h.constructorName,
      expected_date: h.expectedDate || null,
      macros: macrosToJson(h.macros),
    }));

    const { error } = await supabase
      .from('houses')
      .insert(housesInsert);

    if (error) {
      console.error('Error saving houses:', error);
      return false;
    }

    return true;
  }, []);

  // Save a quadra
  const saveQuadra = useCallback(async (projectId: string, quadra: Quadra): Promise<string | null> => {
    const { data, error } = await supabase
      .from('quadras')
      .insert({
        id: quadra.id,
        project_id: projectId,
        name: quadra.name,
        house_ids: quadra.houses,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving quadra:', error);
      return null;
    }

    return data.id;
  }, []);

  // Update a quadra
  const updateQuadraInDb = useCallback(async (quadra: Quadra): Promise<boolean> => {
    const { error } = await supabase
      .from('quadras')
      .update({
        name: quadra.name,
        house_ids: quadra.houses,
      })
      .eq('id', quadra.id);

    if (error) {
      console.error('Error updating quadra:', error);
      return false;
    }

    return true;
  }, []);

  // Delete a quadra
  const deleteQuadraFromDb = useCallback(async (quadraId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('quadras')
      .delete()
      .eq('id', quadraId);

    if (error) {
      console.error('Error deleting quadra:', error);
      return false;
    }

    return true;
  }, []);

  // Update houses quadra reference
  const updateHousesQuadra = useCallback(async (projectId: string, houseNumbers: number[], quadraId: string | null): Promise<boolean> => {
    for (const houseNumber of houseNumbers) {
      const { error } = await supabase
        .from('houses')
        .update({ quadra_id: quadraId })
        .eq('project_id', projectId)
        .eq('house_number', houseNumber);

      if (error) {
        console.error('Error updating house quadra:', error);
        return false;
      }
    }

    return true;
  }, []);

  return {
    loadProjects,
    saveProject,
    updateProjectInDb,
    deleteProjectFromDb,
    saveHouse,
    saveHouses,
    saveQuadra,
    updateQuadraInDb,
    deleteQuadraFromDb,
    updateHousesQuadra,
  };
}
