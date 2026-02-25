-- Fix house 73 position: move it before house 74 in quadra G
UPDATE quadras 
SET house_ids = ARRAY[59,60,61,62,63,64,65,66,73,74] 
WHERE id = 'db204d9c-970c-477f-a844-0fdbef11a69b';