
-- Clean up stale "Massa niveladora interna" from Tapejara project
DELETE FROM project_contract_services 
WHERE project_id = 'ef9e2b1a-c1ff-4189-a655-99a925961460' 
AND scope_id = 'scope_1770673961285';

DELETE FROM service_planning_by_period 
WHERE project_id = 'ef9e2b1a-c1ff-4189-a655-99a925961460' 
AND scope_id = 'scope_1770673961285';

DELETE FROM measurement_services 
WHERE project_id = 'ef9e2b1a-c1ff-4189-a655-99a925961460' 
AND scope_id = 'scope_1770673961285';
